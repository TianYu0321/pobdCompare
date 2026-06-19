from __future__ import annotations

import shutil
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_BREAK
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph


def insert_after(paragraph: Paragraph, text: str = "", style: str | None = None) -> Paragraph:
    element = OxmlElement("w:p")
    paragraph._p.addnext(element)
    inserted = Paragraph(element, paragraph._parent)
    if style:
        inserted.style = style
    if text:
        inserted.add_run(text)
    return inserted


def main() -> None:
    source = Path(sys.argv[1])
    backup = source.with_name(f"{source.stem}.pre-p3-backup{source.suffix}")
    if not backup.exists():
        shutil.copy2(source, backup)

    document = Document(source)

    replacements = {
        "1. buildXml / .build\n2. WeGame 分享链接\n3. poe.ninja / 标准 PoB2 数据源，后续扩展":
            "1. buildXml / .build / .xml\n2. WeGame 分享链接（MVP 正式范围）\n3. poe.ninja 角色链接及其 pathOfBuildingExport（MVP 正式范围）",
        "MVP 工程第一阶段优先支持：": "MVP 工程必须同时支持：",
        "buildXml / .build": "1. buildXml / .build / .xml\n2. WeGame 分享链接\n3. poe.ninja 角色链接",
        "WeGame Adapter 并行开发，但不能阻塞 Simulation Engine。":
            "WeGame Adapter 与 poe.ninja Adapter 均属于 MVP 数据接入；任何来源只有通过本地 PoB2 加载验证并生成 baseline 后，才可开放收益模拟。",
    }
    for paragraph in document.paragraphs:
        if paragraph.text in replacements:
            paragraph.text = replacements[paragraph.text]

    title = document.paragraphs[0]
    cursor = insert_after(title, "2026-06-19 P3/MVP 范围修订（优先级高于原文）", "Heading 1")
    revision_lines = [
        "1. WeGame 与 poe.ninja 数据接入属于 MVP，不再后置。",
        "2. 三类输入（.build/.xml、WeGame URL、poe.ninja URL）必须经本地 PoB2 验证后才能标记为可计算；映射不完整时只展示 normalized 数据，禁止生成假收益。",
        "3. P3 主界面为 Build A 42% / Diff Rail 16% / Build B 42% 的游戏化双 BD 工作台，不以报告页或调试面板为主界面。",
        "4. 装备区必须使用固定角色槽位布局；完整词条、双方差异和 PoB2 替换收益进入侧边抽屉。",
        "5. 暂停完整天赋树 UI。P3 只交付下一点收益榜、路径包收益榜、移除损失榜，并明确 pathAutoFilled 与 cascadeRemoved。",
        "6. P3 支持 A/B 装备池的连续临时 Variant，以及 undo / redo / reset；baseline 永久不可变。",
        "7. incompatible、invalid_variant、calc_failed 必须保持独立状态，不得显示为普通负收益或 DPS -100%。",
        "8. WeGame DimensionEvaluation 评分不得进入产品模型；本项目不做 BD、装备或防御评分。",
        "9. 后置到 P3.5/P4：装备词条编辑、技能等级/品质/辅助编辑、天赋与珠宝编辑、游戏级完整天赋树。",
    ]
    for line in revision_lines:
        cursor = insert_after(cursor, line)
    cursor.add_run().add_break(WD_BREAK.PAGE)

    document.core_properties.comments = (
        "P3/MVP revised on 2026-06-19: WeGame and poe.ninja moved into MVP; "
        "game-style dual build workbench and passive ranking constraints added."
    )
    document.save(source)
    print(source)
    print(backup)


if __name__ == "__main__":
    main()
