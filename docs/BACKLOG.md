# EscapeBot Backlog

## 本檔職責 / 整體進度

> **整體進度（Phase / Milestone 哪些已 ship、下一個做什麼）以「EscapeBot-設計文件」為單一真相源**（該檔的「📊 專案狀態 / Gate」+ 第六部分「目前進度」）。本檔**不再複述 milestone 進度**——以前在這裡維護一份, 必然跟設計文件漂移（曾停在「M3 是 Next」整整落後兩個 milestone）。
>
> 本檔只管 BACKLOG 本職:engine/generator 的 findings 與 bug（已解 / 待辦）、累積的方法論 insight、chain mode、cost、deploy 教訓。要看「現在做到哪、下一個做什麼」請看設計文件。

- **Collaborator**: 已邀請一位 frontend co-designer 加入 (equal-status, 負責 Phase 2 視覺/前端)。走 B 路徑邀請 (拿能順暢通關的 working prototype 邀, 非 spec)。

---

## 核心 insight (累積的方法論)

### 1. Tap UI 是照妖鏡 (2026-05-27, 方法論層級)

純文字 Discord 版的 narration 會蓋住所有「LLM 嘴上演的事 vs state 真實發生的事」的落差。
玩家只看文字, 文字說拿到了就以為拿到了, 沒有 UI 揭穿。

Tap UI 把 state 攤在 button 上 (背包有沒有那個 item / 出口鎖沒鎖), 每個落差立刻現形。

**重要推論**: Milestone 2 修的 bug 大多不是 web 新 bug, 是 Discord 版一直存在但隱形的 engine/generator 缺陷。
- 兩版共用同一套 engine model (locations/items/puzzles), 這些修復**對 Discord 版也適用**。
- Discord 版那 ~5 個 user 很可能玩在一個有隱形瑕疵的版本 (偶爾拿不到東西 / 穿過假鎖, 被純文字蓋住, 玩家沒抱怨可能只是剛好沒卡到通關必須的物件)。
- → TODO: 查 Discord player log 有沒有 take_item / move_player reject 記錄, 驗證隱形瑕疵規模。

### 2. validateScenarioLogic + repairItemConsistency = 可解性保證層 (可能是技術壁壘)

「LLM 生成關卡, 但保證可玩」這件事, 沒有自動機制保證時, LLM 會生出死鎖 / 孤兒 reward / 無解 puzzle / 內部不一致。
這輪意外長出兩個東西構成第一道防線:
- `validateScenarioLogic()`: 生成時偵測無法自動修補的真死鎖 → retry 重生
- `repairItemConsistency()`: 生成時自動修補可修復的不一致 (item 雙向登記) → 不重生

哲學: **LLM 生成的結構不被信任為最終 state**, 先過一層程式檢查 —
- 能自動修補的 → 程式補
- 不能修補的真死鎖 → retry
- 設計上盡量把問題歸到「可自動修補」類, 減少昂貴的整場景重生

這是「LLM 當 amplifier、state machine 當基石」哲學的具體落地, 且**可能是這類遊戲的核心技術壁壘**。

### 3. LLM 生成需要內部一致性的結構化資料時, 總會漏某些約束

不管 prompt 怎麼教 (即使 gemini-2.5-pro), LLM 系統性地會漏雙向登記、放錯 puzzle 位置、漏填 union optional 欄位。
結論: 不該奢望 prompt 教會, 要靠程式事後修補 / 驗證, 不信任 LLM 輸出為最終 state。

---

## Organic referral evidence (important signal)

### 2026-05-13

Player H 主動拉新玩家進 server.

**Significance**: 第一個 organic referral (非 creator 主動邀)
- Phase 1 product 達「值得分享」minimum threshold
- Discord-only model 已 demonstrate referral 能力

**Stacking signals from Player H 同日**:
- Chain mode positive ("不錯")
- 主動 ask continuation ("通關後還有下一個嗎")
- 主動拉朋友 referral

**Caution**: Sample size 1, 不是 pattern. 需要 3-5 個 independent referrals 才能 declare organic traction.

**Action items**:
- 觀察新玩家 behavior (不主動 onboard, 看自然 friction)
- Phase 2 ship 後可能重新評估「何時開始 organic distribution」(PTT / Reddit / HN)

---

## Validated direction: Chain mode (CONFIRMED — multi-player evidence)

### Evidence

**Player H (casual segment, phase 1 production)**:
- 通關後**主動問** "通關後還有下一個嗎?"
- Chain mode idea 反應「不錯」
- 不擔心 creator 假設的 "會太長" concern
- 解讀: 玩家自然 baseline 期望 product 有 continuation

**Player A (tinkerer, phase 1 production)**:
- v2 38 turn 通關但沒主動分享
- 通關 = 結束 = retention 自然斷
- Chain mode 該創造「想繼續玩到 chapter N」motivation

**Observer Y**:
- 「需要 GUI / 視覺體驗」
- 玩家通關當下期望 engagement upgrade

### Design (proposed)

- Room 1 通關 → 結局頁面「進入下一章」button (player-controlled)
- Room 2 scenario gen 接受 room 1 summary as context
- Inventory carry: hybrid (universal items carry, room-specific reset)
- Finite chain: 5-7 chambers per chain product
- 第一個 chain product: TBD (Spaceship Trilogy / Alchemist Tower / 偵探推理)

### Engineering plan

> web 基礎建設與 M1–M4a（web foundation、餵貓循環、分享卡等）的進度見設計文件,不在此複述。chain mode 本身的規劃:
- chain mode schema + first chain product
- chain mode UI + endgame design

### Strategic value

- Niche deepening: LLM + escape room + finite chain = no direct competitor
- "值得分享" leverage: "我玩到第 N 章了" status signal
- Natural retention without violating success metric
- AI Dungeon 有 endless mode 但無 genre, EscapeBot 提供 structured chain

### Open questions

- Inventory carry hybrid 的具體 rules
- 不同 chain products 之間切換 (mid-chain abort 怎麼處理?)
- Endgame 設計: 每 chain 最後 chamber 該怎麼 narrate "saga ends" without anticlimax?

---

## Findings — 已解決 (shipped)

### Phase 1.5 (Discord production, verified by 2 real players)

- **F1**: 解謎成功 narration 模糊 → 明確說「解開了」+ 物理變化 + 因果。✅
- **F2**: 動作不通只回「沒反應」→ in-character 說明 + location guidance。✅
- **F11**: 詭異動作 (吃鑰匙/跟椅子說話) plain refusal → in-character 詭異接受, state 不變。✅
- **F15**: solution 格式 parsing + 反問確認流程 (Discord 版)。✅ (註: TS port 退化, 見 F-web-f15退化)
- **F-hint**: 玩家問線索被當 injection 拒絕 → in-character hint, 不 spoil。✅

### Phase 2 Milestone 1 + 2 (web, 2026-05-27)

每條標注 **[engine 共通]** (Discord 版也有, 修復可搬回) / **[generator 品質]** / **[web 特有]**。

- **F-web-langkey** [web 特有]: SDK 讀 `GOOGLE_GENERATIVE_AI_API_KEY` 但 env 設成 `GEMINI_API_KEY` → 所有 LLM call 失敗 → 英文 fallback。修: 本地 .env.local + Vercel 都改正確變數名。✅

- **F-web-f15退化** [engine 共通]: F15 反問流程 port 到 TS 後「是」那 turn 撈不回原答案 (attemptedSolution undefined) + prompt 內部矛盾 (snake/camel 混用 + "ONLY explicit verb" vs "fill anyway")。修: 拿掉反問, 玩家給具體答案直接解 (同時改善 F-input)。✅

- **F-web-allornothing** [engine 共通]: processTurn 全批驗證, 一個違規整批 reject + 3x retry → latency 30-47s, narration 丟成「Nothing happens」。修: partial apply — 逐個 enforceStateChange, 合法 apply / 非法 skip, narration 永遠保留, 移除 retry → latency 3-6s。✅

- **F-web-flash-optional** [engine 共通]: gemini-2.5-flash 對 union type 的 optional 欄位 (attemptedSolution) 生成不可靠, 常漏填 → solve_puzzle 永遠 reject → 任何 string-match puzzle 解不開。修: backfillSolution (漏填時用玩家 raw action 補) + normalizeSolution (去空白/標點/底線)。✅

- **F-web-假結局** [engine 共通]: LLM 在沒贏時 narration 演「逃脫畫上句點」, checkWin 還沒過 → 玩家以為結束卻還能玩 → 又掙扎十幾 turn (最糟 Turn 37 演結局, Turn 51 才真通關)。修: turnHandler 加 Ending Restraint — narration 不宣告結束, 勝利由引擎判定。✅

- **F-web-鎖門穿透** [engine 共通, 重要]: Location 沒有「鎖」的 state 欄位, 鎖純靠 LLM 軟性把關 (puzzle 沒解就不 emit move_player)。Discord 純文字玩家被 LLM 唬住; web tap 的明確 button 指令「前往X」誘導 LLM emit move_player, rule enforcer 沒鎖檢查就放行 → 穿過。(高中 hardcoded 版有真鎖 room_order/door_lock_status, LLM 重構成 models.py 版時丟了)。
  修 (五層補齊): types.ts Location 加 `lockedByPuzzleIds`; ruleEnforcer move_player 檢查未解的 lockedByPuzzleIds → hardcoded reject; toView 算 exit isLocked; page.tsx 鎖住出口顯示 🔒 disable; scenarioGenerator prompt 教生成 lockedByPuzzleIds; turnHandler prompt 教 LLM 別 emit 到鎖住房間。✅ (真鎖進 main line, 向後相容: 舊存檔 default [])

- **F-web-解鎖死鎖** [generator 品質]: generator 把開門 puzzle 放進它鎖住的房間 → 要解謎才能進但 puzzle 在房裡 → 死鎖。rule enforcer 要求 puzzle.locationId === currentLocationId 所以 solve 靜默 reject, 但 LLM 照演開門。修: validateScenarioLogic() 生成時偵測 → retry。✅

- **F-web-孤兒item** [engine 共通, root cause 重要]: item.locationId 跟 location.itemIds **兩處記錄, generator 只更新一個**。toView + take_item 驗證讀 loc.itemIds → 看不到/拿不到; 但 LLM 看完整 ws.items → narrate 拿到了 → state change 靜默 drop。(這是之前 security-keycard「LLM 一直想拿但一直 reject」的同一 bug; 對應 research sketch「Item.location_id 多處 sync」)。
  修 (統一權威來源): take_item 驗證 + toView 都改讀 `item.locationId` (不信 loc.itemIds) + validateScenarioLogic 加雙向檢查。✅

- **F-web-生成太久** [generator 品質]: LLM (即使 pro) 系統性常漏 item 雙向登記 → validateScenarioLogic 每次 retry 重生 (9000+ token pro call) → 生成 3 分鐘+。洞察: 對「可自動修補的小瑕疵」用「整場景重生」是錯手段。修: 分兩類 — 可自動修補 (雙向登記不同步) → repairItemConsistency() 程式直接補 loc.itemIds 不 retry; 真死鎖 → 才 retry。✅ (生成回到 36-66s, attempt=1)

### 部分解決

- **F-input + F2x** [Milestone 2 解]: 純文字 input friction → tap UI (場景物件/出口/背包 button) 解掉。80% turn 不用打字。F11 詭異動作 + 解謎答案仍用文字框 (常駐底部)。✅ 核心已解。
- **F1b** [部分解]: reject narration 模糊「nothing happens」→ partial apply 後 narration 永遠保留 (不再全丟成 nothing happens) + reject log 加具體原因。但「玩家側」的明確 reject 訊息 (密碼錯 vs 系統 bug 區分) 仍可再強化。🔄 部分。

### Phase 2 Milestone 4b 期間 (web, 2026-06-02)

- **F-replay** [web, 已完成 — M4b-B / 缺口分析 A3]: 重玩這一局 — 打開 A 分享卡的人能親自玩 A 玩過的同一關 (同房間/物品/謎題), 自己玩自己的。詳細設計見 M4b-spec B 段; 以下記**實作落地與追蟲教訓**。
  **架構 (定案)**: 不用 seed 確定性重生 (LLM 非確定性, 重生不會一樣); 存初始 WorldState JSON 快照 + 重載。
  - 快照在 `generate()` 當下抓 (通關時 world_states 已是終局、撈不回初始)。
  - 存兩處: `world_states.initialState` (generate 當下寫、turn 不覆寫) + `createShare` 時複製進 `shares.initialState`。**shares 是 append-only** (一 user 玩多次 = 多筆 share, 各帶自己那關的乾淨初始, 互不覆蓋) — 用 shareId 區分, 不存 world_states/user (會被 overwrite)。
  - 重玩流程: `startReplay(shareId)` → 讀 share.initialState → patch sessionId 成 B 的 clerkUserId (純 LLM flavor, 非 DB key) → saveWorldState(B) → client `router.push('/play?replay=1')` → /play 的 useEffect 偵測 `?replay=1` → getCurrentState() 讀 B 的 world_states → toView → 進遊戲。
  - **可傳遞**: B 通關也存自己的 initialState → B 的卡也能被重玩 → A→B→C 鏈。不在 URL 傳關卡資料 (只傳 shareId, server 撈)。
  **三輪 bug (全靠加 log 抓 runtime 才定位, 非讀 code)**:
  1. **登入 404**: `/sign-in` route 不存在 (Clerk 走 hosted UI), 改 `<SignInButton forceRedirectUrl>`。
  2. **重玩「失敗」假象**: server action 裡 `redirect('/play')` 拋 NEXT_REDIRECT error, 從 client component event handler 呼叫時被 `catch` 攔下顯示「重玩失敗」, navigation 沒發生。改: server action 回傳 `{status:'ok'}`, client 自己 `router.push`。**教訓: Next.js redirect() 在 server action 裡是用「丟特殊 error」實作的, client try/catch 會誤殺。**
  3. **重玩跳到開新場景**: /play 本來沒有「讀現有 world_states 進遊戲」的 on-mount 邏輯 (進頁就是從按鈕開始), startReplay 存了快照但 /play 沒讀。加 `?replay=1` useEffect → getCurrentState 載入。
  **端到端驗過**: 電腦 + 手機 (無痕換帳號), A 通關分享 → B 載 A 那關乾淨初始 (turnCount 0) → B 自己玩通關 (同關 diverge: A 21 turns / B 14 turns) → B 卡也能再重玩。
  **檔案**: schema.ts、drizzle/migrations/0003_*、sessionStore.ts、engine/index.ts、actions.ts、s/[shareId]/page.tsx、s/[shareId]/ReplayCTA.tsx。
  **註**: production 與 local 共用同一 Neon DB (endpoint ep-snowy-meadow-aol7b1yb), migration 已 apply。

- **F-mobile-viewport** [web 特有, 追蟲教訓重要]: 手機 (尤其 LINE in-app browser) 鍵盤 / iOS 系統 UI (靈動島、通話列) 出現時, 遊戲版面「跑掉」—— 整頁可橫向左右滑、canvas 右側露空白、捏按鈕被推出畫面切掉。
  **根因**: canvas、輸入列、prefill chip、popup 的寬度都吃 **layout viewport** (402)。iOS 鍵盤 / 系統 UI 只壓縮 **visual viewport** (縮成 352)、**layout viewport 不變**。於是 402 寬的內容 > 352 可視區 → iOS 允許橫向捲動。**canvas 尺寸本身一直正常 (370 穩定), 問題是內容綁錯 viewport 來源。**
  **修 (整頁綁 visual viewport)**: JS 監聽 visualViewport, 把 `visualViewport.width` 寫入 CSS 變數 `--vvw`; PlayPage wrapper + 所有內容寬度綁 `min(原 maxWidth, var(--vvw))`; canvas 偏移用 `--vvml` (margin-left) 修正 (原 `margin:0 auto` 是相對 layout viewport 402 置中, 在 352 可視區裡偏右); `body overflow-x:hidden` 當保險; 桌面 fallback (--vvw/--vvml 未設) 維持原 `margin:auto`/100%。✅
  **追蟲教訓 (這隻躲了十幾版, 值得記)**: 現象「手機版面亂」與根因「內容綁 layout viewport」隔很遠。一路誤判: 先以為是讀回覆框 (sheet) 定位 → 改 bottom sheet → visualViewport 重定位 sheet → ResizeObserver 寬度過濾 → scrollTo 歸位 → 才靠**畫面 debug overlay 印出 innerW/clientW/vvW/containerW/canvas 各寬度**, 一眼看出 canvas (370) 沒壞、是整頁內容超出縮小的可視區。**未來類似症狀: 別從 sheet/canvas 開始追, 直接看「內容寬度綁的是 layout 還是 visual viewport」+ 用畫面 overlay 印實際值 (手機/in-app browser 不能開 DevTools)。** 同「prefill 當照妖鏡」「加 log 抓 runtime 而非讀 code」的方法論。
  **跨裝置未驗 (重要)**: 整套修法只在 iPhone + LINE 驗過。其他 iPhone / Android / iPad / 各 in-app browser (IG/FB/Messenger) / 橫向**未驗證**, 且修法含寫死數字 (padding 16、容差) 是風險點。**主動傳播 (PTT/Reddit/HN) 前該系統性驗一輪** — 陌生人裝置雜, 歪掉直接傷第一印象/viral。
  **連帶**: 手機旁白框改底部 sheet + 打字 (input focus) 時收起 (visualViewport 高度定位試過不穩, 改 focus 收起繞開 iOS 鍵盤坑); 剩餘 fit 見 F-mobile-fit。

---

## Findings — 待辦

### F-visibility (NEXT UP, 最高優先, engine 架構級): 沒有 visibility 模型 / 物件全可見

**現象**: engine 沒有「物件被發現了沒」的概念。Item schema 只有 id/name/description/locationId/isTakeable/isLocked/unlockItemId — 沒有 visible/hidden/discovered。物件結構完全平的 (generator prompt 明文「no sub-containers, items sit directly in location's itemIds」), 「便條在桌上」只能讓便條和桌子並列在同一 location 的 itemIds → 進房第一秒兩者同等可見、同等可 take。「查看桌子才發現便條」這層探索**從來不存在** — 「查看」在 engine 層不是動作, 只是丟給 LLM 生 narration, 不改 state、不 promote 任何物件。

**怎麼被揪出**: prefill 查看 chip 從 sceneItems 生成, 把「查看便條」白紙黑字攤在玩家眼前、無法繞過。narration 的軟把關 (turnHandler prompt「never reveal undiscovered items」) 還可能含糊, chip 是明確列表 → 必穿。**prefill 當照妖鏡, 同 M2 tap UI 揭穿隱形 engine bug 的機制。**

**同族 (root cause 重要)**: 跟 F-web-鎖門穿透 (鎖純靠 LLM 軟把關、沒 state 欄位 → tap 明確指令一逼就穿)、F-web-孤兒item 同一個教訓 — **LLM 軟性把關擋不住明確 UI / state 缺欄位**。對應方法論 insight: 「LLM 輸出不被信任為最終 state, 該補程式層 / state 結構」。

**要做**: Item 加 hidden / revealedByAction 之類欄位; 「查看」變成會 promote 物件成 visible 的真動作; toView() 與 LLM context 都依 visibility 篩 (只送已發現的)。generator 要能生成「便條歸屬於桌子、查看桌子才現」的結構。

**不只是修 bug**: 這是「逐步發現 / 探索層次」這個遊戲性的基礎 — 目前所有東西開局全攤開, 根本沒有探索。屬遊戲設計決定 (作者已拍板: 要這層)。架構級, 動手前先說明方向 (schema + 查看動作流程 + visibility 篩選) 再寫。

**優先級**: next up, 但**非 T0 阻斷** — 遊戲照玩、能通關、能驗證, 只是探索被提前揭露。提到最前是不讓它無限期靠軟把關撐著。做好後 prefill 查看 chip 改為依 visible 過濾 (現在 chip 暫留, 標已知缺陷)。

### F-share (核心已解 — M4a 已上線): 通關後沒可分享 artifact

Player A v2 38 turn 通關 ✅ 但沒主動截圖分享。Observer Y: 「需要視覺體驗」。當時 tap UI 通關只有「🎉 你通關了」文字, 沒分享卡。
**已解 (M4a)**: LLM 生成中文金句卡 + server 防偽 + 短碼 `/s/{shareId}` + Open Graph 預覽, 已上線 (見設計文件第六部分)。
**剩餘 / 後續**: F11 weird moments archive (卡片內容增量) 尚未做, 屬 M4b「卡片內容增量」+ C 版分享卡方向 (見 M4b-spec、分享卡C版)。
**重玩 (M4b-B) 已完成**: 見已解區 F-replay (2026-06-02)。

### F-resume (待辦, 軸 B, 低成本 — replay 基礎建設已到位): /play 無 resume, F5 掉出遊戲

**現象**: /play 是純 client component, 遊戲狀態存 React state。F5 / 重整理 → state reset → started=false → 回到「開始新場景」按鈕。**world_states 在 DB 完好 (沒被破壞), 只是 UI 沒去讀它** — 是「缺少的功能」不是「讀壞」。手機切 app 回來、網路斷重整也會踩到。
**為什麼低成本**: resume 需要的「讀 world_states → toView → 進遊戲」路徑, **F-replay 已經鋪好** (`?replay=1` 那條就是)。F5 掉局只是「沒帶信號去觸發它」。把 F5 也接上這條, resume 幾乎免費。
**定位**: 軸 B (流失) — 玩到一半掉局是流失點, 但非阻斷 (能通關、能驗證)。非 next up (visibility 排前面)。
**範圍待作者定**: (a) 接續邏輯 + 回覆內容 (history 在 DB, 從 history 重新生成滿地包子, 預設散落) — 低~中成本, 基礎建設已到位; (b) 連物理擺放都還原 (包子在哪、排成什麼樣) — 要額外持久化 canvas 座標 (現在不存), 成本高且與「滿地包子是當下玩的」設計有點衝突。作者傾向 (a) 範圍。

### F-mobile-fit (待辦, 視覺/手機適配, 後續優化): 手機畫面 fit 一個螢幕

**現象**: 手機直式下整頁可上下捲 (canvas + chip + input + 說明高度 > 可視高度), 且 canvas 上方有一塊空白 (canvas 固定寬高比, 塞進高螢幕填不滿, 上半是空天空、無內容)。作者要: 整頁 fit 一個畫面、不能上下捲。
**已做**: canvas 橫向已全寬 (見下方 F-mobile-viewport)。
**待做**:
- **縱向收掉上方空天空**: canvas 上半無內容, 減少上方天空顯示高度、讓貓+地面上移填滿可視區, 整頁塞進可視高度。不壓縮變形、不動場景構圖、不丟內容 (那塊本來就空)。是高度版的「綁 visualViewport.height」, 對稱於已解決的寬度版 --vvw。
- **輸入列 + chip 保留 padding** (不貼齊螢幕邊, 按鈕緊貼邊難按); canvas 全寬、輸入列/chip 留邊, 分開處理。
**注意**: 做時小心別跟已完成的寬度版 --vvw 約束打架 (viewport 同類, 這隻蟲橫跨十幾版, 容易連環追)。

### F2y (待辦): puzzle clue 隱藏在 location object 內

Player H: 「看看四周的時候講多一點, 不管有用沒用都要講」。
puzzle clue 嵌在 location object, 「看四周」narration 不含, 玩家要主動「看 X」。
修: Tier 1 prompt (看四周 narration 含所有 visible features 含門/牆/地板暗示); Tier 2 schema (Location 加 notable_features)。

### F-spoil (待辦): bot 過度 helpful, narrate solution 太直接

Player H: 「直接說要這樣輸入了, 應該說要幫他們排序」。
puzzle.description 混了 visible clue + solution 推理過程。
修: Scenario Generator prompt — description 只描述 visible 線索, solution 由玩家推, 線索可分散到多個 item。

### F-orphan (root cause 已知, 防線待補): orphan reward items

Player: 「識別卡要幹嘛凹凹凹凹」。生了 reward item 但沒 puzzle 用到 → 玩家拿了發現沒用。
**註**: 「拿都拿不到」的底層 bug 已由 F-web-孤兒item 修掉 (雙重記錄)。剩「拿得到但沒用途」這層。
修: validateScenarioLogic 加「reward item 必須有 puzzle 用到」檢查 (見下方基礎設施 TODO); puzzle hint 暗示需要哪個 item; (Tier 3) inventory item tap 顯示「為什麼撿的」。

### F5 (待辦): drop item action type

Engine 已 port, web UI 可加 button + Rule Enforcer 加 drop_item type。

### F-web-combo (engine 限制, 之後修): solution 只支援單一 StringMatch

puzzle.solution 是單一字串靠 normalizeSolution 比對。做不到 A+B 組合 / 多步驟 / item combo / state pattern。
對應 research sketch 的 Solution discriminated union (StringMatch / StatePattern / StateChangeSequence / ItemCombo)。
玩家撞到時用單一答案 workaround。

---

## 開放設計問題 (待作者拍板, 非 bug)

### Q-埋貓: 「滿地包子圍住/埋住貓」這個畫面要不要成立?

**現象**: 手套移動包子做完後發現 —— 玩家用手套**圍不住貓**。包子只能在靠前地面排小堆。

**根因 (架構級, 非手套沒做好)**: 落地包子在 XZ 水平地面 + 3D 透視投影。貓固定在**遠處的深度平面**, 包子往貓的深度去會被透視縮小 (現加 MIN_BUN_SCALE=0.55 下限不縮成點, 但仍明顯變小), 且貓的深度跟包子能堆到的靠前地面**不在同一處** → 包子在視覺上堆不到貓身上。「滿地包子埋住貓」這個畫面在現架構下**長不出來**。手套是「可用性 (撥開擠在一起的包子) + 地面排小堆」工具, 不是「埋貓」工具。

**牽動什麼 (重要)**: **分享卡 C 版**整份立論建立在「滿地包子 (被埋的貓) 是最荒謬、最可截圖的畫面」上 (見分享卡C版該檔)。若埋不住貓, C 版那張卡的核心現場畫面要重新想 —— 這是 C 版的前提性疑慮。

**選項**:
- (a) 維持現狀: 接受「圍不住貓」, 手套定位為可用性工具; C 版的「現場感」改用別的構圖 (例如就是靠前地面一小堆 + 遠處的貓, 而非埋住)。
- (b) 動空間架構: 讓落地包子進一個**無縱深、貓也在其中**的平面 (例如垂直 XY 面), 包子才可能視覺上堆到貓身上把牠埋住。大改, 動落地物理基面 + 3D→2D 交接 + C 版構圖。曾討論過, 作者當時選維持 XZ。

**狀態**: 待作者確認要不要那個「埋貓」畫面。決定了才知道 (a) 收工 or (b) 重啟空間架構討論。**不在現在動**。

---

## 關鍵基礎設施 TODO: validateScenarioLogic 持續擴充

目前 validateScenarioLogic 擋: (1) puzzle 鎖在自己鎖住的房間 (2) item 雙向登記不同步 (後者改為 repairItemConsistency 自動修補)。

該持續加的可解性 / 一致性檢查:
- **reward item 孤兒** (生了 reward 但沒 puzzle 用到 — 解 F-orphan)
- **win condition 不可達** (target location 永遠到不了 / required puzzle 無解)
- **puzzle 線索缺失** (puzzle 答案的線索沒生在任何 item description / location feature 裡)
- **連通性** (所有房間從起點透過解謎路徑可達, 無孤島房間)

repairItemConsistency 的 console.warn 會持續報「LLM 每場漏幾個雙向登記」— 累積這數字當 generator 行為觀察, 判斷哪些約束 LLM 系統性失敗。

---

## Backlog (Phase 2 post-Milestone 4)

### F9: Puzzle variety
- 多場後玩家看穿 fetch quest pattern 重複
- Fix: Scenario Generator prompt 強制每場 ≥2 種 puzzle types
- Types: fetch quest / code derivation / sequence / combination / observation / logic

### F11 Tier 2: Item hidden personality
- 玩家對物品說話/查看 → 偶爾觸發 personality (需 schema Item.secret_personality)

### F11 Tier 3: stagnant_streak tracker
- 連續 N turn 無進展 → trigger Type C/D narration

### F13: Weird moment count metric
- TurnResult 加 is_weird_moment; Win embed 加「✨ 詭異瞬間: N 次」

### F16: Multi-hop movement
- Tier 1: Turn Handler narrate 中間經過, state 一次 1 hop
- Tier 2: Rule Enforcer 支援 multi-hop chain

### 小尾巴 (replay 收尾遺留, 輕)
- **重玩載入文字 misleading**: 重玩進 /play 時短暫顯示「🔮 謎題生成中…(約 30–60 秒)」, 但重玩其實是毫秒級 DB 讀取 (載快照, 沒在生成)。會讓 B 以為在等生成。改: 加獨立 loadingReplay 狀態顯示「載入這一關…」之類。
- **ReplayCTA 兩按鈕大小不一**: 「挑戰 EscapeBot →」比「重玩這一關」大 (寬高不一致)。純 CSS 對齊。
- **offset 族一次性盤點**: 「拿 sprite.x/y 當包子位置、漏視覺中心偏移」已出現過多條路徑 (M3 修過點選/描邊/落地, prefill 後又揪兩條)。grep 所有 sprite.x/y 用法, 一次盤完防第 N 條。

---

## Backlog (Phase 3)

### F-theme: Theme presets
- 治癒系 / 克蘇魯系 / 賽博龐克 / 蒸汽龐克 / 童話 / 末日
- Scenario Generator system prompt 加 theme prefix; 玩家選 theme 影響整個生成
- 跟 chain mode 結合: 整個 chain 同 theme

### F3: 環境線索持久化
- 玩家筆記本 / 線索列表; 早期看到的線索後續可查
- 配合 F-orphan (inventory item tap 顯示 context)

### F4: 救援機制 explicit design
- 「鎖頭其實鬆動」這類 fallback hint 是 feature 還是 bug

### F7: 風味動作 support
- 穿衣服 / 對物品唱歌 等非 puzzle 動作允許 narration-only

### F8: Rule Enforcer 兩層 design
- Layer 1 嚴格 (影響 puzzle/win) / Layer 2 寬鬆 (純風味)

### F14: Non-linear puzzle chain
- Puzzle 間 interconnected; 需要更強 LLM planning

---

## Out of scope

- Multi-player co-op
- Mobile native app
- 純 NPC 對話模擬
- 純 narrative / visual novel
- 醫療 / 法律專業模擬
- 多 LLM provider fallback
- Personalized AI (記住玩家偏好)
- Retention reward (streak / badge) — 違反「值得分享」success metric

---

## Cost monitoring

### Phase 1 production (Discord bot)

Viral player baseline (3 sessions, 262 turns): NT$141.99 (~$4.6 USD)
- Per-turn: ~$0.018
- 一般玩家 50-80 turns: ~$1-1.5
- 5 朋友混合: ~$15/月

Safety net: Google AI Studio $30/月 hard cap

### Phase 2 web (觀察中)

- Scenario 生成: gemini-2.5-pro, 36-66s/場, ~5000-9600 output token
- partial apply 移除 3x retry 後, turn latency 3-6s (原 30-47s), 同時降 turn cost (單次 flash call)

---

## Deploy lessons learned

### Phase 1 (Discord bot, fly.io)

- `.dockerignore` 必須有 `.venv/` (本地 venv 蓋掉 Linux builder venv)
- Fly machine stuck after deploy: `flyctl machine start <id>`
- `.env` 加 `.dockerignore`, production 用 fly secrets
- Player session data `User/users/` 加 `.gitignore`
- Dockerfile CMD 用絕對路徑 `/app/.venv/bin/python`

### Phase 2 (Next.js, Vercel, Drizzle)

#### Race condition on save world state
- SELECT-then-INSERT-or-UPDATE 有 TOCTOU race
- 解法: PostgreSQL UNIQUE constraint + ON CONFLICT DO UPDATE

#### Vercel AI SDK + Gemini nested dict schema collapse
- z.record(string, X) 在 SDK convert 時 collapse 成 {type: object}, Gemini 生 empty dict
- 解法: output: 'no-schema', 用 Zod refine 玩家端 validate

#### System prompt camelCase 一致性
- Phase 1 Python snake_case → port 到 TS camelCase, system prompt 的 JSON schema 描述也要 sync
- 否則 LLM 生 snake_case → Zod parse fail (見 F-web-f15退化, 同類根源)

#### Vercel sensitive env vars
- Dashboard add 的 Sensitive vars 拉不到 .env.local; 解法: vercel env add CLI (預設 non-sensitive)

#### Gemini SDK 認的環境變數名
- @ai-sdk/google 讀 `GOOGLE_GENERATIVE_AI_API_KEY`, 不是 `GEMINI_API_KEY` (見 F-web-langkey)
- 本地 .env.local + Vercel 都要設對, 否則靜默走 fallback

#### dump/debug script 的 env 載入順序坑
- ES module import hoisting: 頂部 import engine 會先觸發 db 連線初始化, 早於 dotenv config 執行
- DATABASE_URL 在 .env.local 帶引號會被 postgres 當 URL 一部分 → Invalid URL
- 教訓: debug script 別跟 dev server 搶 env; 直接讓專案的 Claude Code 自己跑自己查, 比隔空寫 dump script 快 (這類工具問題易陷入 yak shaving)

#### LLM 生成關卡的一致性不可信任
- 即使 gemini-2.5-pro, 系統性會漏雙向登記 / 放錯 puzzle 位置 / 漏填 union optional 欄位
- 解法: 生成後過 repairItemConsistency (自動修補) + validateScenarioLogic (真死鎖才 retry)
- 原則: LLM 輸出不是最終 state, 要程式驗證/修補層

#### iOS / in-app browser 的 viewport 行為 (見 F-mobile-viewport)
- **layout viewport (clientWidth) vs visual viewport (visualViewport.width) 是兩回事**: iOS 鍵盤 / 系統 UI (靈動島、通話列) 只壓縮 visual viewport, layout viewport 不變。CSS 的 `%` / `100vw` / `window.innerWidth` 各自吃哪個要分清。
- canvas / 內容若綁 layout viewport, 可視區被壓縮時內容會超出 → 橫向可滑。要綁 visual viewport (JS 寫進 CSS 變數) 才跟得上。
- **LINE / IG / FB 等 in-app browser 的 viewport 行為非標準**, 不能只在一個環境調對就當全平台 OK。
- **手機 / in-app browser 不能開 DevTools** → 用畫面 debug overlay 印實際值 (innerW/clientW/vvW/容器寬/canvas 寬) 來定位, 比讀 code 推斷快得多。
- **Clerk dev key**: 目前 production 仍用 development keys (console 會警告 strict usage limits)。**上線 / 主動傳播前要換 production key。**