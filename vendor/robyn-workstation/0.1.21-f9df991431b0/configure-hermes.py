"""Refresh managed credentials at boot without printing or baking any secrets."""
import json
import os
from pathlib import Path
import tempfile
import yaml

def configure():
    token = os.environ.get("AGENT37_MANAGED_TOKEN")
    base = os.environ.get("AGENT37_LLM_PROXY_URL")
    if not token or not base:
        raise RuntimeError("Managed model environment is unavailable")
    home = Path.home()
    path = home / ".hermes" / "config.yaml"
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    cfg = (yaml.safe_load(path.read_text()) if path.exists() else {}) or {}
    cfg["model"] = {"provider": "custom:Agent37", "default": "default"}
    providers = [p for p in cfg.get("custom_providers", []) if p.get("name") != "Agent37"]
    providers.append({"name": "Agent37", "base_url": base, "api_key": token,
                      "api_mode": "chat_completions", "model": "default"})
    cfg["custom_providers"] = providers
    servers = cfg.setdefault("mcp_servers", {})
    # Refresh any previously installed managed services too; restart rotates
    # their shared instance token. Do not add unrelated tools to the employee.
    for name, variable in [("composio", "AGENT37_COMPOSIO_MCP_URL"), ("perflo", "AGENT37_PERFLO_MCP_URL")]:
        if name in servers and os.environ.get(variable):
            servers[name] = {"url": os.environ[variable], "headers": {"Authorization": "Bearer " + token}}
    servers["studio"] = {"command": "/usr/local/bin/node", "args": [str(home / ".robyn" / "studio-mcp-v0.1.21.cjs"),
                          "--config", str(home / ".robyn" / "active-assignment.json")], "timeout": 2700}
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".robyn-config-")
    with os.fdopen(fd, "w") as output:
        yaml.safe_dump(cfg, output)
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)

if __name__ == "__main__":
    configure()
    print(json.dumps({"managed_model_configured": True, "studio_mcp_configured": True}))

