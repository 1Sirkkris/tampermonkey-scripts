# Tampermonkey Scripts

Amazon FC userscripts maintained in this repository.

Each script installs separately and keeps its own GitHub update URL.

## Bulk install / move to another browser

This is the closest practical option to a one-click install while keeping every script separate.

1. Open **Tampermonkey Dashboard → Utilities**.
2. Under **Import from URL**, paste the link below.
3. Review the list and click **Import**.

**Install pack:**

https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/dist/tampermonkey-scripts.zip

Tampermonkey 5.5.6232 or newer can import ZIP files directly from a URL.

For older versions:

1. [Download the install pack](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/dist/tampermonkey-scripts.zip).
2. Open **Tampermonkey Dashboard → Utilities → Zip → Choose File**.
3. Select the ZIP and import the scripts.

The ZIP contains every `.user.js` file in the repository and is rebuilt automatically whenever a userscript changes.

> [!WARNING]
> The pack includes stable, deprecated, personal and CLEAN TEST scripts. It is intended for bulk import/backup. Do **not** enable a master/test script together with the standalone scripts it replaces, or the same page automation may run twice.

## Current standalone scripts

Click **Install** beside a script. Tampermonkey will open its normal install screen and use GitHub for future updates.

| Script | Version | Install |
|---|---:|---|
| FCResearch → RIVER Ticket Assistant | 0.2.21 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_RIVER_Ticket_Assistant_v0_2_21.user.js) |
| Multi-container & Multi-ASIN EditItems Auto Expiration Date | 5.1 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multi_container_Multi_ASIN_EditItems_Auto_Expiration_Date.user.js) |
| FCResearch Sideline Bin Size | 0.1.2 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Sideline_Bin_Size.user.js) |
| Dropzone Selector | 0.2.9 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Dropzone_Selector.user.js) |
| FCResearch Scan Flow | 0.7 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Scan_Flow.user.js) |
| SidelineApp Helper | 0.9.41 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper.user.js) |
| Multi move all | 1.0.1 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multi_move_all.user.js) |
| FcSku Flipper | 1.0.23 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FcSku_Flipper.user.js) |
| Auto-Collapse TT | 1.2 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Auto_Collapse_TT.user.js) |
| FNSKUmapping Console | 1.2.3 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FNSKUmapping_Console.user.js) |
| Calm Code | 1.3.0 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Calm_Code.user.js) |
| PO Cell Highlighter | 1.8.12 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/PO_Cell_Highlighter.user.js) |
| Highlighter + Madcat + Size | 2.8 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Highlighter_Madcat.user.js) |
| Edit Sku/Container detector | 4.0.12 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Edit_Sku_Container_detector.user.js) |
| SIM Markdown Toolbar | 5.0.21 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SIM_Markdown_Toolbar.user.js) |
| Stow Andons Helper | 5.3 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper.user.js) |
| Bin check Overlay | 7.2 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Bin_check_Overlay.user.js) |
| Carton PrEditor | 7.2 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Carton_PrEditor.user.js) |

## Combined / CLEAN TEST scripts

Use these instead of their overlapping standalone scripts—not alongside them.

| Script | Version | Replaces / overlaps | Install |
|---|---:|---|---|
| AFT Tools Master CLEAN TEST | 0.2.0 | EditItems, FcSku Flip and MoveItems helpers | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/AFT_Tools_Master_CLEAN_TEST.user.js) |
| FCResearch Master CLEAN TEST | 0.1.2 | Multiprint/PanDash, Highlighter/Madcat and Sideline Size | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Master_CLEAN_TEST.user.js) |
| FCResearch PO + Scan Flow CLEAN TEST | 0.1.0 | PO Cell Highlighter and FCResearch Scan Flow | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_PO_Scan_CLEAN_TEST.user.js) |
| SidelineApp Helper CLEAN TEST | 1.4.3 | SidelineApp Helper | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Helper_CLEAN_TEST.user.js) |
| Stow Andons Helper — Safe Trim TEST | 5.4.3-test | Stow Andons Helper | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Stow_Andons_Helper_v5.4_TEST.user.js) |
| SidelineApp Standalone Tote Queue TEST | 0.3.0 | Tote Queue inside either SidelineApp Helper | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/SidelineApp_Fast_Tote_Queue_TEST.user.js) |

## Personal utility

| Script | Version | Notes | Install |
|---|---:|---|---|
| FCResearch Size Collector | 1.0 | `krmclenn` only; requires the local PowerShell writer | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/FCResearch_Size_Collector.user.js) |

## Deprecated

| Script | Version | Install |
|---|---:|---|
| Multiprint + Pandash | 1.8.37 | [Install](https://raw.githubusercontent.com/1Sirkkris/tampermonkey-scripts/main/scripts/Multiprint_Pandash.user.js) |
