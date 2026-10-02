import type { SoulWrite } from "@/lib/soul-input";

// Only SOUL.md in the *running* Hermes profile is reachable. User text travels as encoded data,
// never shell/Python source. Read only the profile path from process environments, never secrets.
const SCRIPT = String.raw`
import base64, hashlib, json, os, pathlib, stat, sys, tempfile, fcntl

class SoulError(Exception):
    def __init__(self, code): self.code = code

def profile_home():
    workers, gateways = set(), set()
    for entry in pathlib.Path('/proc').iterdir():
        if not entry.name.isdigit(): continue
        try:
            args = [a.decode(errors='replace') for a in (entry/'cmdline').read_bytes().split(b'\0') if a]
            worker = any(a.endswith('/hermes_worker.py') for a in args)
            gateway = 'gateway' in args and 'run' in args and any(pathlib.Path(a).name == 'hermes' for a in args[:3])
            if not worker and not gateway: continue
            env = dict(part.split(b'=', 1) for part in (entry/'environ').read_bytes().split(b'\0') if b'=' in part)
            home = env.get(b'HERMES_HOME', b'').decode().strip()
            if not home: home = str(pathlib.Path(env.get(b'HOME', b'/home/node').decode())/'.hermes')
            if not pathlib.Path(home).is_absolute(): raise SoulError('profile_unavailable')
            (workers if worker else gateways).add(str(pathlib.Path(home).resolve()))
        except (OSError, UnicodeError, ValueError): continue
    homes = workers or gateways
    if len(homes) != 1: raise SoulError('profile_unavailable')
    return pathlib.Path(next(iter(homes)))

def read_soul(home):
    target = home/'SOUL.md'
    try: fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError: return b'', False
    except OSError: raise SoulError('unsafe_file')
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1: raise SoulError('unsafe_file')
        data = source.read(65537)
    if len(data) > 65536: raise SoulError('too_large')
    try: data.decode('utf-8')
    except UnicodeError: raise SoulError('invalid_text')
    return data, True

def revision(home, data, exists):
    return hashlib.sha256(str(home).encode() + b'\0' + str(exists).encode() + b'\0' + data).hexdigest()

def run(body):
    home = profile_home()
    lock_fd = os.open(home/'.robyn-soul.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'rb') as lock:
        if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode) or os.fstat(lock.fileno()).st_nlink != 1: raise SoulError('unsafe_file')
        fcntl.flock(lock, fcntl.LOCK_EX)
        data, exists = read_soul(home)
        token = revision(home, data, exists)
        if body is not None:
            if body['revision'] != token: raise SoulError('conflict')
            updated = body['content'].encode('utf-8')
            if len(updated) > 65536 or b'\0' in updated: raise SoulError('invalid_text')
            fd, temporary = tempfile.mkstemp(prefix='.robyn-soul-', dir=home)
            try:
                with os.fdopen(fd, 'wb') as destination:
                    destination.write(updated)
                    destination.flush()
                    os.fsync(destination.fileno())
                os.replace(temporary, home/'SOUL.md')
            finally:
                if os.path.exists(temporary): os.unlink(temporary)
            data, exists = updated, True
            token = revision(home, data, exists)
        return {'content': data.decode('utf-8'), 'revision': token, 'exists': exists}

try:
    payload = json.loads(base64.b64decode(sys.argv[1]))
    print(json.dumps({'document': run(payload)}))
except SoulError as error:
    print(json.dumps({'error': error.code}))
except Exception:
    print(json.dumps({'error': 'unavailable'}))
`;

export function hermesSoulCommand(write?: SoulWrite): string {
  const payload = Buffer.from(JSON.stringify(write ?? null)).toString("base64");
  return `timeout 30 python3 - '${payload}' <<'ROBYN_SOUL_PY'\n${SCRIPT}\nROBYN_SOUL_PY`;
}
