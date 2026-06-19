import base64
import zlib

with open(r'D:\pobdCompare\tests\fixtures\builds\gothmommyaltgirl.pobcode', 'r') as f:
    code = f.read().strip()

# PoB2 解码逻辑: 替换 - 为 +，_ 为 /，然后 base64 解码，然后 zlib inflate
fixed = code.replace('-', '+').replace('_', '/')

# 尝试添加 padding
padding_needed = 4 - (len(fixed) % 4)
if padding_needed != 4:
    fixed += '=' * padding_needed

try:
    decoded = base64.b64decode(fixed)
    print(f"Base64 decoded: {len(decoded)} bytes")
    print(f"First 50 bytes: {decoded[:50]}")
    print(f"Last 50 bytes: {decoded[-50:]}")
    
    # 尝试 zlib inflate
    try:
        inflated = zlib.decompress(decoded, -15)  # -15 = raw deflate (no zlib header)
        print(f"\nInflated: {len(inflated)} bytes")
        print(f"First 200 chars: {inflated[:200].decode('utf-8', errors='replace')}")
    except Exception as e:
        print(f"\nzlib.decompress(raw deflate) failed: {e}")
        try:
            inflated = zlib.decompress(decoded)  # standard zlib
            print(f"Standard zlib inflated: {len(inflated)} bytes")
            print(f"First 200 chars: {inflated[:200].decode('utf-8', errors='replace')}")
        except Exception as e2:
            print(f"Standard zlib also failed: {e2}")
            
except Exception as e:
    print(f"Base64 decode failed: {e}")
