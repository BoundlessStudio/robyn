"""Configure a managed model and immutable, task-bound internal Robyn profiles.

No provider API calls occur here. The server supplies private files and identity.
Profiles separate task state; they do not sandbox the shared Unix account.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.parse import urlsplit
import uuid
import yaml

VERSION = "0.2.0"
APPS = {"cadcraft", "deckcraft", "designcraft", "effectcraft", "figcraft", "filmcraft", "gridcraft",
        "lightcraft", "pdfcraft", "photocraft", "solidcraft", "soundcraft", "vectorcraft", "wordcraft"}


def atomic_text(path, text):
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".robyn-config-")
    try:
        with os.fdopen(fd, "w") as output:
            output.write(text)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def managed_model(cfg):
    token = os.environ.get("AGENT37_MANAGED_TOKEN")
    base = os.environ.get("AGENT37_LLM_PROXY_URL")
    parsed = urlsplit(base or "")
    if not token or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError("Managed model environment is unavailable")
    cfg["model"] = {"provider": "custom:Agent37", "default": "default"}
    providers = [p for p in cfg.get("custom_providers", []) if p.get("name") != "Agent37"]
    providers.append({"name": "Agent37", "base_url": base, "api_key": token,
                      "api_mode": "chat_completions", "model": "default"})
    cfg["custom_providers"] = providers
    return cfg


def digest(path):
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("Task artifact must be a regular file")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def task_identity(config, args):
    try:
        assignment = str(uuid.UUID(args.expected_assignment))
    except (ValueError, TypeError, AttributeError):
        raise RuntimeError("Invalid expected assignment") from None
    if (not isinstance(args.expected_generation, int) or args.expected_generation < 1
            or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", args.expected_profile or "")
            or args.expected_profile == "default"):
        raise RuntimeError("Invalid expected task profile")
    identity = {"assignmentId": assignment, "generation": args.expected_generation,
                "profile": args.expected_profile}
    if config.get("kind") != "robyn" or any(config.get(k) != v for k, v in identity.items()):
        raise RuntimeError("Task identity does not match profile configuration")
    if not re.fullmatch(r"rbs_[A-Za-z0-9_-]{43}", config.get("token", "")):
        raise RuntimeError("Invalid task credential")
    allowed = config.get("allowedAppIds")
    if (not isinstance(allowed, list) or not allowed or any(not isinstance(app, str) or app not in APPS for app in allowed)
            or len(set(allowed)) != len(allowed)):
        raise RuntimeError("Invalid task application list")
    for key in ("workRoot", "stateRoot"):
        if not isinstance(config.get(key), str) or not Path(config[key]).is_absolute():
            raise RuntimeError("Task folders must be absolute")
    return identity


def skill_files(source):
    files = {}
    for item in sorted(source.rglob("*")):
        if item.is_symlink():
            raise RuntimeError("Task skills must not contain symlinks")
        if item.is_file():
            relative = item.relative_to(source)
            if len(relative.parts) == 1 and item.suffix == ".md":
                relative = Path("robyn-" + item.stem) / "SKILL.md"
            key = relative.as_posix()
            if key in files:
                raise RuntimeError("Duplicate task skill path")
            files[key] = {"source": item, "sha256": digest(item)}
    return files


def configure_task(home, args):
    config_path = Path(args.config).absolute()
    config_hash = digest(config_path)
    config = json.loads(config_path.read_text())
    identity = task_identity(config, args)
    bundle, soul, source_skills = Path(args.bundle).absolute(), Path(args.soul).absolute(), Path(args.skills_dir).absolute()
    if not source_skills.is_dir() or source_skills.is_symlink():
        raise RuntimeError("Task skills directory is unavailable")
    skills = skill_files(source_skills)
    for app_id in config["allowedAppIds"]:
        if not any(name in skills for name in (f"robyn-{app_id}/SKILL.md", f"{app_id}/SKILL.md")):
            raise RuntimeError("Task application skill is missing")
    studio_mcp = {"command": "/usr/local/bin/node", "args": [str(bundle),
        "--config", str(config_path), "--expected-assignment", identity["assignmentId"],
        "--expected-generation", str(identity["generation"]), "--expected-profile", identity["profile"]], "timeout": 2700}
    binding = {**identity, "clientVersion": VERSION, "configPath": str(config_path),
               "configSha256": config_hash, "bundlePath": str(bundle), "bundleSha256": digest(bundle),
               "soulSha256": digest(soul), "skills": {name: item["sha256"] for name, item in skills.items()},
               "studioMcp": studio_mcp}
    root = home / ".robyn"
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    profiles = home / ".hermes" / "profiles"
    profiles.mkdir(parents=True, mode=0o700, exist_ok=True)
    profile = profiles / identity["profile"]
    with (root / "profile-configuration.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if profile.exists():
            marker = profile / "robyn-binding.json"
            if profile.is_symlink() or not marker.is_file() or json.loads(marker.read_text()) != binding:
                raise RuntimeError("An installed task profile is immutable")
            verify_profile(profile, binding)
            refresh_model(profile / "config.yaml")
            return identity
        temporary = Path(tempfile.mkdtemp(dir=profiles, prefix=".robyn-profile-"))
        try:
            cfg = managed_model({"terminal": {"backend": "local", "cwd": config["workRoot"], "home_mode": "profile"}})
            cfg["mcp_servers"] = {"studio": studio_mcp}
            atomic_text(temporary / "config.yaml", yaml.safe_dump(cfg))
            shutil.copyfile(soul, temporary / "SOUL.md")
            os.chmod(temporary / "SOUL.md", 0o600)
            for name, item in skills.items():
                target = temporary / "skills" / name
                target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                shutil.copyfile(item["source"], target)
                os.chmod(target, 0o600)
            atomic_text(temporary / "robyn-binding.json", json.dumps(binding, sort_keys=True))
            # Hermes recognises a profile by its config/SOUL identity files. The
            # atomic rename prevents a gateway from reading a partially built one.
            os.rename(temporary, profile)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
    return identity


def verify_profile(profile, binding):
    cfg = yaml.safe_load((profile / "config.yaml").read_text()) or {}
    if cfg.get("mcp_servers") != {"studio": binding.get("studioMcp")}:
        raise RuntimeError("Task MCP binding changed")
    if digest(Path(binding["configPath"])) != binding["configSha256"] or digest(Path(binding["bundlePath"])) != binding["bundleSha256"]:
        raise RuntimeError("Task configuration or runtime changed")
    if digest(profile / "SOUL.md") != binding["soulSha256"]:
        raise RuntimeError("Task instructions changed")
    for name, sha in binding["skills"].items():
        if digest(profile / "skills" / name) != sha:
            raise RuntimeError("Task application skill changed")


def refresh_model(path):
    cfg = (yaml.safe_load(path.read_text()) if path.exists() else {}) or {}
    atomic_text(path, yaml.safe_dump(managed_model(cfg)))


def configure(home=None, args=None):
    home = Path(home) if home is not None else Path.home()
    if args is not None and args.config:
        return configure_task(home, args)
    path = home / ".hermes" / "config.yaml"
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    cfg = (yaml.safe_load(path.read_text()) if path.exists() else {}) or {}
    # No task token in the shared default profile, and no mutable active pointer.
    cfg.setdefault("mcp_servers", {}).pop("studio", None)
    atomic_text(path, yaml.safe_dump(managed_model(cfg)))
    refreshed, unavailable = 0, 0
    for marker in sorted((path.parent / "profiles").glob("*/robyn-binding.json")):
        try:
            binding = json.loads(marker.read_text())
            verify_profile(marker.parent, binding)
            refresh_model(marker.parent / "config.yaml")
            refreshed += 1
        except Exception:
            # Removed/changed credentials keep a retired profile closed. Never
            # replace them with the current task's file, or block other profiles.
            unavailable += 1
    return {"taskProfilesRefreshed": refreshed, "taskProfilesUnavailable": unavailable}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    parser.add_argument("--expected-assignment")
    parser.add_argument("--expected-generation", type=int)
    parser.add_argument("--expected-profile")
    parser.add_argument("--bundle")
    parser.add_argument("--soul")
    parser.add_argument("--skills-dir")
    arguments = parser.parse_args()
    if arguments.config and not all((arguments.expected_assignment, arguments.expected_generation,
                                     arguments.expected_profile, arguments.bundle, arguments.soul, arguments.skills_dir)):
        parser.error("Task configuration needs its expected identity, bundle, soul and skills directory")
    try:
        result = configure(args=arguments)
    except Exception:
        # YAML/JSON parser exceptions may include private input lines. Do not
        # expose those or a traceback through provider exec logs.
        print(json.dumps({"error": "task_profile_configuration_failed"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps({"managed_model_configured": True, "studio_mcp_configured": bool(arguments.config), **result}))
