# Tampermonkey Scripts

Amazon FC userscripts maintained in this repository.

`/scripts` is the active/current working set. Disabled/retired installs are preserved under `/archive/scripts` so they are kept for reference without cluttering the active script folder.

## Bulk install / move to another browser

1. Open **Tampermonkey Dashboard → Utilities**.
2. Under **Import from URL**, paste the link below.
3. Review the list and click **Import**.

**Install pack:**

https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/dist/tampermonkey-scripts.zip

Tampermonkey 5.5.6232 or newer can import ZIP files directly from a URL.

> [!WARNING]
> Do **not** enable a master/test script together with standalone scripts it replaces.

## Current standalone scripts

| Script | Version | Install |
|---|---:|---|
| Dropzone Selector | 0.2.9 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Dropzone_Selector.user.js) |
| FCResearch Scan Flow | 0.7 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Scan_Flow.user.js) |
| Multi move all | 1.0.1 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multi_move_all.user.js) |
| FcSku Flipper | 1.0.23 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FcSku_Flipper.user.js) |
| Auto-Collapse TT | 1.2 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Auto_Collapse_TT.user.js) |
| FNSKUmapping Console | 1.2.3 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FNSKUmapping_Console.user.js) |
| Calm Code | 1.3.0 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Calm_Code.user.js) |
| SIM Markdown Toolbar | 5.0.21 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SIM_Markdown_Toolbar.user.js) |
| Carton PrEditor | 7.2 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Carton_PrEditor.user.js) |

## Combined / CLEAN TEST scripts

| Script | Version | Replaces / overlaps | Install |
|---|---:|---|---|
| FCResearch Master CLEAN TEST | 0.1.4 | Multiprint/PanDash, Highlighter/Madcat, Sideline Size and PO Cell Highlighter | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Master_CLEAN_TEST.user.js) |
| AFT Tools Master CLEAN TEST | 0.3.5 | EditItems, FcSku Flip and MoveItems helpers | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/AFT_Tools_Master_CLEAN_TEST.user.js) |
| SidelineApp Helper CLEAN TEST | 1.4.3 | SidelineApp Helper | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js) |
| Stow Andons Helper — Safe Trim TEST | 5.4.5-test | Stow Andons Helper | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper_v5.4_TEST.user.js) |
| Bin check Overlay TEST | 7.3.3-test | Bin check Overlay 7.2 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/bin-overlay-v7-3-test/scripts/Bin_check_Overlay_v7.3-test.user.js) |
| SidelineApp Standalone Tote Queue TEST | 0.3.0 | Tote Queue inside either SidelineApp Helper | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js) |

## Personal utility

| Script | Version | Notes | Install |
|---|---:|---|---|
| FCResearch Size Collector | 1.0 | `krmclenn` only; requires the local PowerShell writer | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Size_Collector.user.js) |

## Archive

Disabled/retired scripts from the Tampermonkey cleanup are preserved in [`archive/scripts`](archive/scripts/). See [`archive/README.md`](archive/README.md) for the list and original versions.
