#!/usr/bin/env python3
# 从图集量出 56 个小人的紧贴包围盒，生成 src/lib/sprite/frames.js 的 FRAMES 表。
#
# 换一套素材时重跑：python3 scripts/motion-frames.py > src/lib/sprite/frames.js
# 验收：加 --verify 会额外画一张带框的 docs/motion-library-frames.png。
#
# 网格只用来「限定每个小人的搜索区域」，不直接当裁剪框：紧贴包围盒才能把
# 格子下方的名字文字和相邻格子排除掉。少数横跨网格的动作给 SEARCH_OVERRIDES。
# 纯标准库，无依赖。
import zlib, struct, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "motion-library.png")


def read_png(path):
    data = open(path, "rb").read()
    pos, idat = 8, b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            w, h, bd, ct, _c, _f, inter = struct.unpack(">IIBBBBB", body)
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
    bpp = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    assert bd == 8 and inter == 0, (bd, ct, inter)
    raw, stride, rows, prev, p = zlib.decompress(idat), w * bpp, [], bytearray(w * bpp), 0
    for _ in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(bpp, stride): line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]; c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        rows.append(line); prev = line
    return w, h, bpp, rows, ct


def write_png(path, w, h, bpp, rows, ct=2):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, ct, 0, 0, 0)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                           + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


# 与 src/lib/sprite/library.js 的 GROUPS 同构：(x0, y0, 组宽, 行高, 每行(列数, 名字表))
GROUPS = [
    ("chest", 15, 180, 553, 148, [
        (5, ["杠铃卧推", "哑铃卧推", "史密斯机卧推", "推胸机（水平）", "推胸机（上斜）"]),
        (5, ["推胸机（下斜）", "上斜推举机", "哑铃上斜卧推", "水平推举机", "胸部推举机"]),
        (5, ["蝴蝶机夹胸", "绳索夹胸", "哑铃飞鸟", "双杠臂屈伸", "实力推"]),
        (4, ["哑铃侧平举", "绳索下压", "仰卧起坐", "卷腹"]),
    ]),
    ("back", 575, 180, 573, 148, [
        (5, ["引体向上", "助力引体向上", "高位下拉（宽握）", "高位下拉（窄握）", "坐姿绳索划船（窄握）"]),
        (5, ["坐姿器械划船", "低拉划船", "水平划船", "杠铃俯身划船", "史密斯俯身划船"]),
        (5, ["T 杠划船", "单臂哑铃划船", "哑铃俯身飞鸟", "蝴蝶机反向飞鸟", "绳索反向飞鸟"]),
        (4, ["哑铃弯举", "站姿/坐姿哑铃弯举", "杠铃弯举", "单杠悬挂"]),
    ]),
    ("legs", 1158, 180, 360, 148, [
        (3, ["杠铃深蹲", "史密斯深蹲", "高脚杯深蹲"]),
        (3, ["保加利亚分腿蹲", "倒蹬机/腿举", "腿屈伸"]),
        (3, ["腿弯举", "坐姿腿内收", "坐姿腿外展"]),
        (3, ["罗马尼亚硬拉", "单腿罗马尼亚硬拉", "悬挂举腿"]),
        (3, ["平板支撑"]),
    ]),
    ("cardio", 15, 812, 953, 170, [
        (5, ["跑步机爬坡", "户外跑", "跑步机跑", "爬楼机", "骑行"]),
    ]),
]

# 横跨网格、单独摆放、或名字不在下方的动作：直接给 [x0, y0, x1, y1] 搜索窗口。
# back 末行 4 个小人按约 130px 间距排，跟上面 5 列网格对不上，逐个钉死；
# 「平板支撑」的名字写在小人右侧（x≥1348），窗口右边界收到 1338 就把字排除；
# 举过头的动作把上沿提到 606，才接得住抬起来的手臂。
SEARCH_OVERRIDES = {
    "仰卧起坐": [282, 630, 396, 708],
    "卷腹": [412, 630, 530, 708],
    "平板支撑": [1256, 730, 1338, 786],
    "哑铃弯举": [588, 612, 690, 708],
    "站姿/坐姿哑铃弯举": [700, 612, 820, 708],
    "杠铃弯举": [845, 612, 940, 708],
    "单杠悬挂": [980, 606, 1065, 708],
    "悬挂举腿": [1410, 606, 1500, 700],
}


def ink(r, g, b):
    lum = (r * 299 + g * 587 + b * 114) // 1000
    return lum < 150 and r < 175 and (r + 12) >= g >= (b - 18)


def main():
    w, h, bpp, base, ct = read_png(SRC)
    vis = [bytearray(r) for r in base] if "--verify" in sys.argv else None

    def row_ink(y, x0, x1):
        row = base[y]
        return sum(1 for x in range(max(0, int(x0)), min(w, int(x1)))
                   if ink(row[x * bpp], row[x * bpp + 1], row[x * bpp + 2]))

    def label_cut(y0, y1, x0, x1):
        """找「小人与名字之间」的空白带，返回名字顶边 y。

        名字是横向排布的深棕小字，和上面的小人之间总隔着一段连续低墨迹行
        （单行名、两行名都一样）。只在搜索窗下半部找，避免把小人头部与身体
        之间的空隙误当成名字带。找不到就返回 y1，退化成原来的全窗搜索。
        """
        lo = int(y0 + (y1 - y0) * 0.45)
        hi = int(y1)
        blank = 0
        for y in range(lo, hi):
            if row_ink(y, x0, x1) <= 2:
                blank += 1
                if blank >= 5:
                    return y - blank + 1
            else:
                blank = 0
        return hi

    def bbox(x0, y0, x1, y1, cutY=None):
        minx, miny, maxx, maxy, count = 10**9, 10**9, -1, -1, 0
        top = min(h, int(y1 if cutY is None else cutY))
        for y in range(max(0, int(y0)), top):
            row = base[y]
            for x in range(max(0, int(x0)), min(w, int(x1))):
                i = x * bpp
                if ink(row[i], row[i + 1], row[i + 2]):
                    count += 1
                    minx, maxx = min(x, minx), max(x, maxx)
                    miny, maxy = min(y, miny), max(y, maxy)
        return (None, count) if count < 40 else ([minx, miny, maxx + 1, maxy + 1], count)

    def stroke(box, color):
        if vis is None: return
        x0, y0, x1, y1 = box
        for t in range(2):
            for x in range(x0, x1):
                for yy in (y0 + t, y1 - t):
                    i = x * bpp; vis[yy][i:i + 3] = bytes(color)
            for y in range(y0, y1):
                for xx in (x0 + t, x1 - t):
                    i = xx * bpp; vis[y][i:i + 3] = bytes(color)

    print("// 由 scripts/motion-frames.py 从 assets/motion-library.png 量出，勿手改。")
    print("// 换素材重跑：python3 scripts/motion-frames.py > src/lib/sprite/frames.js")
    print("// 值是 [x, y, w, h]，原图像素坐标。想微调某个框，改这里或改脚本的 SEARCH_OVERRIDES。")
    print("export const FRAMES = Object.freeze({")
    for gi, (key, gx0, gy0, gwidth, cellH, rows) in enumerate(GROUPS):
        color = [(220, 40, 40), (40, 140, 60), (40, 90, 220), (180, 40, 180)][gi]
        print(f"  // {key}")
        for rowIndex, (cols, names) in enumerate(rows):
            cw = gwidth / cols
            for col, name in enumerate(names):
                if name in SEARCH_OVERRIDES:
                    win = SEARCH_OVERRIDES[name]
                else:
                    x0 = gx0 + col * cw
                    y0 = gy0 + rowIndex * cellH
                    # 下沿 0.76 行高：把格子底部的名字文字挡在搜索区外。
                    win = (x0 + 4, y0 + 0.03 * cellH, x0 + cw - 4, y0 + 0.76 * cellH)
                # 手工窗口已经排除了名字，不再自动找名字带：
                # 举过头的小人手臂与躯干之间也可能有空白带，会被误判成名字带切掉手臂。
                cut = win[3] if name in SEARCH_OVERRIDES else label_cut(win[1], win[3], win[0], win[2])
                bb, count = bbox(win[0], win[1], win[2], win[3], cutY=cut)
                assert bb, f"{name} 没量到小人（ink={count}）"
                pad = 3
                box = [max(0, bb[0] - pad), max(0, bb[1] - pad),
                       min(w, bb[2] + pad), min(h, bb[3] + pad)]
                stroke(box, color)
                frame = [box[0], box[1], box[2] - box[0], box[3] - box[1]]
                print(f'  "{name}": {frame},')
                print(f"# {name:<16} {frame} ink={count} cut={cut}", file=sys.stderr)
    print("});")
    if vis is not None:
        out = os.path.join(ROOT, "docs", "motion-library-frames.png")
        write_png(out, w, h, bpp, vis, ct)
        print(f"# 验收图 → {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
