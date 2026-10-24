"""Round-trip check for public/js/qr.js: encode with the JS encoder, render, decode with OpenCV.
Usage: python3 scripts/verify-qr.py [payload ...]   (no arguments = every version and error level, filled to capacity)"""
import json, subprocess, sys, os
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))

def dump(ecl, ver, text):
    out = subprocess.run(['node', os.path.join(HERE, 'qr-dump.mjs'), ecl, str(ver), text], capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def decode(d, scale=8, border=4):
    rows = d['rows']; n = len(rows)
    img = np.full(((n + 2 * border) * scale,) * 2, 255, np.uint8)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '1':
                img[(y + border) * scale:(y + border + 1) * scale, (x + border) * scale:(x + border + 1) * scale] = 0
    for det in (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()):
        text, pts, _ = det.detectAndDecode(img)
        if text: return text
    return ''

def main():
    bad = 0; total = 0
    if len(sys.argv) > 1:
        cases = [(e, 1, t) for t in sys.argv[1:] for e in 'LMQH']
    else:
        cases = [(e, v, '@fill') for e in 'LMQH' for v in range(1, 41)]
    for ecl, ver, text in cases:
        d = dump(ecl, ver, text); total += 1
        got = decode(d)
        if got != d['text']:
            bad += 1; print(f'FAIL ecl={ecl} version={d["version"]} mask={d["mask"]} len={len(d["text"])}')
    print(f'{total - bad}/{total} decoded correctly')
    sys.exit(1 if bad else 0)
main()
