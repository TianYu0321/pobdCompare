import ctypes
import json
import os
import sys
import traceback
import io

# Force UTF-8 encoding for stdin/stdout on Windows
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Configuration
POB_ROOT = os.environ.get("POB_ROOT", r"D:\PathOfBuilding-PoE2-dev\PathOfBuilding-PoE2-dev")
LUA_DLL = os.path.join(POB_ROOT, "runtime", "lua51.dll")

if not os.path.exists(LUA_DLL):
    print(
        json.dumps({"success": False, "error": f"lua51.dll not found at {LUA_DLL}"}),
        flush=True,
    )
    sys.exit(1)

# Load LuaJIT DLL
lua = ctypes.CDLL(LUA_DLL)

# Lua C API prototypes
lua.luaL_newstate.restype = ctypes.c_void_p
lua.luaL_openlibs.argtypes = [ctypes.c_void_p]

lua.luaL_loadstring.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lua.luaL_loadstring.restype = ctypes.c_int

lua.lua_pcall.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
lua.lua_pcall.restype = ctypes.c_int

lua.lua_tolstring.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
lua.lua_tolstring.restype = ctypes.c_char_p

lua.lua_pushstring.argtypes = [ctypes.c_void_p, ctypes.c_char_p]

lua.lua_settable.argtypes = [ctypes.c_void_p, ctypes.c_int]

lua.lua_gettop.argtypes = [ctypes.c_void_p]
lua.lua_gettop.restype = ctypes.c_int

lua.lua_settop.argtypes = [ctypes.c_void_p, ctypes.c_int]

lua.lua_pushnumber = ctypes.CDLL(LUA_DLL).lua_pushnumber
lua.lua_pushnumber.argtypes = [ctypes.c_void_p, ctypes.c_double]

LUA_GLOBALSINDEX = -10002


def set_global_string(L, key, value):
    lua.lua_pushstring(L, key.encode("utf-8"))
    lua.lua_pushstring(L, value.encode("utf-8"))
    lua.lua_settable(L, LUA_GLOBALSINDEX)


def set_global_number(L, key, value):
    lua.lua_pushstring(L, key.encode("utf-8"))
    lua.lua_pushnumber(L, float(value))
    lua.lua_settable(L, LUA_GLOBALSINDEX)


def set_global_boolean(L, key, value):
    lua.lua_pushstring(L, key.encode("utf-8"))
    # lua_pushboolean may not be exported; use lua_pushnumber as fallback
    try:
        lua_pushboolean = ctypes.CDLL(LUA_DLL).lua_pushboolean
        lua_pushboolean.argtypes = [ctypes.c_void_p, ctypes.c_int]
        lua_pushboolean(L, 1 if value else 0)
    except AttributeError:
        lua.lua_pushnumber(L, 1.0 if value else 0.0)
    lua.lua_settable(L, LUA_GLOBALSINDEX)


def python_to_lua(value):
    if value is None:
        return "nil"
    elif isinstance(value, bool):
        return "true" if value else "false"
    elif isinstance(value, (int, float)):
        return str(value)
    elif isinstance(value, str):
        escaped = (
            value.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        )
        return f'"{escaped}"'
    elif isinstance(value, list):
        return "{" + ", ".join(python_to_lua(v) for v in value) + "}"
    elif isinstance(value, dict):
        pairs = []
        for k, v in value.items():
            key = f"[{python_to_lua(k)}]"
            pairs.append(f"{key} = {python_to_lua(v)}")
        return "{" + ", ".join(pairs) + "}"
    else:
        return "nil"


def set_global_table(L, key, value):
    lua_code = f"{key} = {python_to_lua(value)}"
    ret = lua.luaL_loadstring(L, lua_code.encode("utf-8"))
    if ret != 0:
        err = lua.lua_tolstring(L, -1, None)
        raise RuntimeError(
            f"Failed to load table for {key}: {err.decode() if err else 'Unknown'}"
        )
    ret = lua.lua_pcall(L, 0, 0, 0)
    if ret != 0:
        err = lua.lua_tolstring(L, -1, None)
        raise RuntimeError(
            f"Failed to set table for {key}: {err.decode() if err else 'Unknown'}"
        )


# Create Lua state
L = lua.luaL_newstate()
if not L:
    print(
        json.dumps({"success": False, "error": "Failed to create Lua state"}),
        flush=True,
    )
    sys.exit(1)

lua.luaL_openlibs(L)

# Set up package paths
runtime_lua = os.path.join(POB_ROOT, "runtime", "lua").replace("\\", "/")
src_dir = os.path.join(POB_ROOT, "src").replace("\\", "/")
pob_root_unix = POB_ROOT.replace("\\", "/")

setup_script = f"""
package.path = package.path .. ";{runtime_lua}/?.lua;{runtime_lua}/?/init.lua;{src_dir}/?.lua;{src_dir}/?/init.lua"
package.cpath = package.cpath .. ";{pob_root_unix}/runtime/?.dll"
arg = arg or {{}}
io.read = function(...) return nil end
GetScriptPath = function() return "{src_dir}/" end
GetRuntimePath = function() return "{pob_root_unix}/runtime/" end
GetUserPath = function() return "{src_dir}/" end
ConPrintf = function() end
"""

ret = lua.luaL_loadstring(L, setup_script.encode("utf-8"))
if ret != 0:
    err = lua.lua_tolstring(L, -1, None)
    print(
        json.dumps(
            {
                "success": False,
                "error": f"Setup load error: {err.decode() if err else 'Unknown'}",
            }
        ),
        flush=True,
    )
    sys.exit(1)

ret = lua.lua_pcall(L, 0, 0, 0)
if ret != 0:
    err = lua.lua_tolstring(L, -1, None)
    print(
        json.dumps(
            {
                "success": False,
                "error": f"Setup runtime error: {err.decode() if err else 'Unknown'}",
            }
        ),
        flush=True,
    )
    sys.exit(1)

# Initialize HeadlessWrapper once (kept alive across requests)
init_script = 'dofile("HeadlessWrapper.lua")'
ret = lua.luaL_loadstring(L, init_script.encode("utf-8"))
if ret != 0:
    err = lua.lua_tolstring(L, -1, None)
    print(
        json.dumps(
            {
                "success": False,
                "error": f"HeadlessWrapper load error: {err.decode() if err else 'Unknown'}",
            }
        ),
        flush=True,
    )
    sys.exit(1)

ret = lua.lua_pcall(L, 0, 0, 0)
if ret != 0:
    err = lua.lua_tolstring(L, -1, None)
    print(
        json.dumps(
            {
                "success": False,
                "error": f"HeadlessWrapper runtime error: {err.decode() if err else 'Unknown'}",
            }
        ),
        flush=True,
    )
    sys.exit(1)

# toJSON is now defined in each Lua template (baseline.lua, mutation_*.lua)
# Pre-compiled global toJSON is no longer needed
toJSON_script = ""

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def handle_request(request):
    try:
        operation = request.get("operation")
        if operation == "convert_wegame":
            template_name = "convert_wegame.lua"
            set_global_table(L, "_character", request["character"])
            set_global_string(L, "_catalog_hash", request["catalogHash"])
        else:
            mutation = request.get("mutation")
            if mutation:
                mutation_type = mutation.get("type")
                if mutation_type == "passive_add":
                    template_name = "mutation_passive_add.lua"
                elif mutation_type == "passive_remove":
                    template_name = "mutation_passive_remove.lua"
                elif mutation_type == "item_swap":
                    template_name = "mutation_gear_swap.lua"
                else:
                    return {
                        "success": False,
                        "error": f"Unsupported mutation type: {mutation_type}",
                    }
            else:
                template_name = "baseline.lua"

        template_path = os.path.join(SCRIPT_DIR, "scripts", template_name)
        with open(template_path, "r", encoding="utf-8") as f:
            template = f.read()

        if operation != "convert_wegame":
            # Set globals for baseline/mutation requests.
            set_global_string(L, "_build_xml", request["buildXml"])
            set_global_number(L, "_skill_number", request["skillNumber"])
            set_global_number(L, "_weapon_set", request["weaponSet"])
            set_global_table(L, "_config", request.get("config", {}))

            if mutation:
                set_global_table(L, "_mutation", mutation)
                payload = mutation.get("payload", {})
                set_global_table(L, "_mutation_payload", payload)

        # Load and run template
        ret = lua.luaL_loadstring(L, template.encode("utf-8"))
        if ret != 0:
            err = lua.lua_tolstring(L, -1, None)
            return {
                "success": False,
                "error": f"Lua load error: {err.decode() if err else 'Unknown'}",
            }

        ret = lua.lua_pcall(L, 0, 1, 0)
        if ret != 0:
            err = lua.lua_tolstring(L, -1, None)
            return {
                "success": False,
                "error": f"Lua runtime error: {err.decode() if err else 'Unknown'}",
            }

        result_str = lua.lua_tolstring(L, -1, None)
        if not result_str:
            return {"success": False, "error": "No result returned from Lua"}

        # Pop result and clear stack
        lua.lua_settop(L, 0)

        # Parse result
        try:
            result = json.loads(result_str.decode("utf-8"))
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"JSON parse error: {e}. First 200 chars: {result_str.decode('utf-8', errors='replace')[:200]}"}
        return result

    except Exception as e:
        return {"success": False, "error": f"Python error: {traceback.format_exc()}"}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            print(
                json.dumps({"success": False, "error": f"Invalid JSON: {e}"}),
                flush=True,
            )
            continue

        response = handle_request(request)
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
