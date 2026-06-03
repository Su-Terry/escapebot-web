# Cat Got Your Words — Backlog

> 對外正式英文名 **Cat Got Your Words**(已定)。`EscapeBot`=舊代號/Discord 版名、`escapebot-web`=GitHub repo 名,沿用為檔名/技術識別字,非產品名。中文對外名未定。

## 本檔職責 / 整體進度

> **整體進度（Phase / Milestone 哪些已 ship、下一個做什麼）以「EscapeBot-設計文件」為單一真相源**（該檔的「📊 專案狀態 / Gate」+ 第六部分「目前進度」）。本檔**不再複述 milestone 進度**——以前在這裡維護一份, 必然跟設計文件漂移（曾停在「M3 是 Next」整整落後兩個 milestone）。
>
> 本檔只管 BACKLOG 本職:engine/generator 的 findings 與 bug（已解 / 待辦）、累積的方法論 insight、cost、deploy 教訓。要看「現在做到哪、下一個做什麼」請看設計文件;chain mode 設計也已移設計文件。

- **Collaborator**: 已邀請一位 frontend co-designer 加入 (equal-status, 負責 Phase 2 視覺/前端)。走 B 路徑邀請 (拿能順暢通關的 working prototype 邀, 非 spec)。

### 📇 待辦索引 (找條目從這裡; 已解的看「Findings — 已解決」區 + 核心 insight)

**進行中 (active)**
| 條目 | 一句話 | 狀態 | 在哪 |
|------|--------|------|------|
| 3a 驗證 | 因果圖 3a 實玩驗證→修→merge | ⚠️ 未完成, 交接中 | 待辦區「3a 驗證進度 + 邊界盤點」 |
| F-stonedoor B | generator 謎題品質 (止血完成, 根治走 Phase 3) | 止血✅ / 3a 進行中 | 待辦區 F-stonedoor |

**待辦 (排隊中)**
| 條目 | 一句話 | 定位 | 在哪 |
|------|--------|------|------|
| F-visibility | 生成 belongsTo 比例待多場實測 | 🔄 partial | 待辦區 |
| F-reward-reveal | reward 解謎前就可見 (solve 揭露路徑未做) | 軸 B, 依賴四拍 solve 驗穩 | 待辦區 |
| F-resume | F5/重整理掉局, 無 resume | 軸 B, 低成本 (replay 路鋪好) | 待辦區 |
| F-idle-hint | 捏了沒射出 → 不打擾提示 | 軸 B 引導, 低成本 | 待辦區 |
| F-mobile-fit | 手機縱向 fit 一個螢幕 | 視覺/手機, 後續優化 | 待辦區 |
| F2y | clue 藏 location object, 看四周不講 | generator | 待辦區 |
| F-spoil | narration 把 solution 講太直接 | generator | 待辦區 |
| F-orphan | reward 沒 puzzle 用到 (防線待補) | generator 驗證層 | 待辦區 |
| F5 | drop item action type | engine 小 | 待辦區 |
| F-web-combo | solution 只支援單一 StringMatch | engine 限制, 之後修 | 待辦區 |
| chain mode | schema + first product + UI/endgame | 設計見設計文件 | 「chain mode 工程待辦」 |
| validateScenarioLogic 擴充 | 孤兒 reward / win 可達 / 線索缺失 / 連通性 | 基礎設施, 持續 | 「關鍵基礎設施 TODO」 |
| F9 / F11 T2,T3 / F13 / F16 / 小尾巴 | puzzle variety / personality / streak / weird metric / multi-hop / replay 小尾巴 | post-M4 增強 | 「Backlog (Phase 2 post-M4)」 |
| F-theme / F3 / F4 / F7 / F8 / F14 | theme / 線索持久化 / 救援 / 風味動作 / 兩層 enforcer / 非線性 chain | Phase 3 後 | 「Backlog (Phase 3)」 |

**待拍板 (非 bug)**
| 條目 | 一句話 | 在哪 |
|------|--------|------|
| Q-埋貓 | 「滿地包子埋住貓」畫面要不要成立 (牽動分享卡 C 版前提) | 「開放設計問題」 |
| 3a merge 決策 | main 止血版見人 vs 3a branch 整批 merge | 3a 交接段 |

---

## 核心 insight (累積的方法論)

> 這幾條是跨多個 bug 反覆出現的大教訓,提到最前當索引。個別 bug 專屬的追蟲細節(redirect 坑、viewport 追蟲史等)留在各自條目、不抽走 —— 教訓離開現場會變空話。

### 1. 照妖鏡:明確 UI 揭穿隱形 state 落差

純文字 narration 蓋住所有「LLM 嘴上演的事 vs state 真實發生的事」的落差 —— 文字說拿到了就以為拿到了, 沒有 UI 揭穿。**Tap UI / prefill chip 把 state 攤在按鈕上**(背包有沒有那 item / 出口鎖沒鎖 / 該物件發現了沒), 每個落差立刻現形。

**反面根因(被照妖鏡揪出的那個東西)**: **LLM 軟性把關擋不住明確 UI / state 缺欄位** —— 鎖純靠 LLM「沒解就別 emit move」軟把關、物件全可見靠 prompt「別揭未發現物」、item 兩處記錄只更新一個, tap/chip 的明確指令一逼就穿。解法一律是補 state 結構: 鎖該有 lockedByPuzzleIds、物件該有 hidden/belongsTo、item 該有單一權威來源。

**重要推論**: M2 修的 bug 大多不是 web 新 bug, 是 Discord 版一直隱形的 engine/generator 缺陷(兩版共用 engine model, 修復對 Discord 也適用; 那 ~5 個 user 很可能玩在有隱形瑕疵的版本)。

體現在: F-web-鎖門穿透、F-web-孤兒item、F-visibility、F-stonedoor。

### 2. LLM 輸出不被信任為最終 state

LLM 生成需要內部一致性的結構化資料時, 不管 prompt 怎麼教(即使 gemini-2.5-pro)系統性會漏雙向登記、放錯 puzzle 位置、漏填 union optional 欄位。**不該奢望 prompt 教會, 要靠程式事後驗證/修補。** 兩層落地:

- **生成層**: `validateScenarioLogic()` 偵測無法自動修補的真死鎖 → retry 重生; `repairItemConsistency()` 自動修補可修復的不一致(item 雙向登記)→ 不重生。原則: 能自動修的程式補、真死鎖才 retry、設計上盡量把問題歸到「可自動修補」類(對「可修補小瑕疵」用「整場景重生」是錯手段, 見 F-web-生成太久)。這是「LLM 當 amplifier、state machine 當基石」的具體落地, **可能是這類遊戲的核心技術壁壘**。
- **回合處理層**: narration 永遠在 state 定案後生(四拍:意圖→判定→敘述), 不讓 narration 領先 state、演假成功、snowball。

體現在: validateScenarioLogic/repairItemConsistency、F-turnloop-v2、F-stonedoor A。

### 3. 加 log 抓 runtime, 別讀 code 推測根因

查 bug 根因要憑**真實 prompt / log / diff**, 不靠讀 code 腦補。「讀 code 推測出的根因」反覆栽過(examine 連續誤判三套、replay 三輪 bug、viewport 躲十幾版)。手機 / in-app browser **不能開 DevTools** → 用畫面 debug overlay 印實際值(各 viewport 寬度等), 比讀 code 推斷快得多。

體現在: F-replay(三輪 bug 全靠加 log 抓)、F-mobile-viewport(overlay 印 viewport 寬才定位)、3a 驗證交接段(examine 誤判三套)。

### 4. dump 壓測 ≠ 實玩

謎題品質的真證明是**實玩解到通關**, 非看 dump。dump 看著乾淨會**低估**問題 —— 淺、邏輯不通(向日葵比月光亮)、format hint 缺數量格式、假線索物件多, 這些 dump 驗不到、實玩才現。「邏輯不通」是最常犯的錯之一、不是偶發。

體現在: E 段(壓測→實玩翻案)、3a 實玩驗證兩場。

### 5. 作者實機事實 > code 推測

哪一版 work / 壞, 以**作者實玩陳述為準**, 不被 code 推測推翻。3a 範圍、examine 哪壞都是作者實機事實先於 code 推測校正過的。

體現在: 3a 驗證交接段(交接注意)。

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

## Player S 回流體驗大改版 evidence (2026-06-02)

Phase 1 老玩家 (Player S) 主動回流玩 Phase 2 大改版 (餵貓 + 3D)。**老玩家會回來看更新** = 弱正面訊號。

**訊號 (分清: 用其暴露的問題 > 用其給的解法)**:
- **A1 互動爆點命中**: 被荒謬勾到、主動截圖共創、丟一串設計點子 (engagement 強)。
- **B2 遊戲理解缺口 (最有用)**: 反覆卡「貓吃包子為啥推進度、邏輯呢」—— 隱喻沒接上。對 Discord 老玩家 (習慣打字指令) 尤其明顯。這是 B2 的真實玩家證據。
- **登入 friction**: 網頁版玩家困惑「為何用 Discord 登入」(預期 Google/email)。對外傳播前該想 provider。連帶 Clerk dev key 待換。
- **建議方向**: 一路推「貓到處跑要瞄準 / 裝翅膀 / 變射擊遊戲 / 包子換一條一條紀錄」。

**Caution (sample 性質, 重要)**: Player S 是好友、認真幫忙想方向、但**偏動作向品味**, 且本身沒接上核心隱喻。非中性大眾樣本。他的建議一致指向「把對話介面變成更好玩的動作/射擊遊戲」—— **不採納那個方向** (稀釋「貓=LLM 化身」核心)。採納「瞄準難度 / 貓更生動」這些強化核心的 (走走停停見 M3); 不採納「貓變射擊標靶」。**參考其暴露的問題 (B2) 勝於其給的解法。**

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

### chain mode 工程待辦

> chain mode 的設計(proposed design / strategic value / open questions)已移入設計文件「chain 模式」小節,不在此複述。BACKLOG 只追蹤工程待辦:
- chain mode schema + first chain product
- chain mode UI + endgame design

---

## Findings — 已解決 (shipped)

### Phase 2 回合處理重構 (web, 2026-06-02)

- **F-turnloop-v2** [engine 架構級, 根治一族 coupled 問題]: 回合處理改「意圖→判定→敘述」四拍, 根治「narration 領先 state、演假成功、snowball」一整族(鎖門穿透/假結局/假 solve/假 move/石門 A)。
  **根**: 舊架構 narration + stateChange 同一 LLM call 生, stateChange 被 reject 後 narration 照樣入 history → LLM 下回合讀自己假話繼續演。一個個修是打地鼠。
  **四拍**: ① Intent — LLM 只出 stateChanges JSON; ② Judge — engine 規則判 move/take/use/examine, solve 走獨立 LLM judge(judge.ts, Verdict 三路 solved/ambiguous/wrong, 不碰 state, retry 後 safe default=ambiguous 不冤判); ③ Apply — engine 唯一改 state 處; ④ Narrate — LLM 拿已定 state 寫 narration, acknowledgedOutcomes 交叉核查, 不一致 retry → 仍不一致走 deterministic fallback(buildFallbackNarration, 不可能矛盾)。
  **吸收**: visibility 三補丁 + wrong-solution retry 刪除(時序問題從根消失)。processTurn 外部 signature 不變(replay/resume 透明、舊存檔相容)。
  **殘留細縫(已知、不宣稱杜絕)**: Phase 4 仍是自由 prose, acknowledgedOutcomes 抓得到顯性假成功、抓不到「模糊暗示」(門縫好像動了)。傷害遠小於石門(state 已是真相、不 snowball), prompt 壓 + 實玩抓。質變: 結構性必然 → 偶爾措辭偏離。
  **實玩驗過(2026-06-02)**: 假 solve/假 move/語意正規化(「73一九」判 solved, 非死字串比)/examine 誠實/通關, **石門兩半都不再發生**。待驗: ambiguous 反問(要語意謎題才測得到)、latency 長期手感。
  **檔案**: types.ts、judge.ts(新)、turnHandler.ts、ruleEnforcer.ts、index.ts。

- **F-visibility** [engine, 已實作 — 部分流程被 F-turnloop-v2 吸收]: 逐步揭露機制 —— Item 加 hidden + belongsTo, hidden 由 deriveHiddenFields 從 belongsTo 推導(LLM 只填 belongsTo、不填 hidden, 從結構杜絕不一致, 電腦這種 top-level 鎖住物件 belongsTo:null → hidden:false 自動可見)。examine 家具 promote 其 hidden children。toView/safeContext 依 visibility 篩。deriveHiddenFields 只在 generateScenario 跑、load/replay 不重推導(examine 過的值保留、replay 載 initialState 全藏從頭探索)。**註**: 原本的 examine 時序補丁(prePromoteExamine 等)已被 F-turnloop-v2 四拍吸收刪除。**待補**: reward item 的「solve 揭露」這條路徑(見待辦 F-reward-reveal); generator 生 belongsTo 的比例待多玩觀察。
  **實機驗證 (2026-06-02)**: generator 確實生 belongsTo、examine 揭露真的跑 —— 實玩「掀開金屬床鋪 → 枕頭底下藏著一張磨損的照片」(照片原 hidden、belongsTo 綁床鋪、查看才 promote 成 visible)。**visibility 非空殼、generator 會生 belongsTo、examine reveal 接四拍通**。這回答了「generator 生不生 belongsTo / visibility 真用還空殼」這個一直掛著的待驗(= reward 揭露的前提)。**仍待**: 生得夠不夠、穩不穩(比例)仍待多場累積,單場只證「會生、真用」。

- **F-intent-boundary** [engine, 2026-06-02]: 建立「貓轉達 / 世界(judge)判定 / 玩家推理」分工邊界, 修「問一句就破關」+ 廢 F-hint。
  **問題**: intent 抽取把「詢問答案對不對」誤判成「提交」——「7319 是正確的嗎?」直接進 judge 判 solved, **玩家問一句就破關**。
  **核心原則**: 貓不知道答案(那是世界的事)、不評判、不提示、不幫推理; 玩家負責推理; 卡住靠謎題本身可推(generator), 不靠貓補救。
  **四類分流**: ①a 詢問帶候選(X對嗎/X行不行)→ intent [], 不進 judge, 貓「我不知道, 要試把 X 捏包子給我」(判不準偏詢問側, 靠 LLM 語意非硬關鍵詞); ①b 求助(給線索/卡住)→ 貓不給方向「推敲是你的事」(廢 F-hint); ② 提交/操作 → 正常 judge(「你/幫我」前綴不影響, attemptedSolution 加提取範例穩定填); ③ 對貓本人 → persona 回應繞回職責、不複述原句。
  **結構保證**: 類型① 不進 judge → 貓拿不到 verdict → 結構上無法評判答案, 只能說「我不知道」(engine + persona 雙重, 非只靠 prompt)。
  **實玩驗過**: 四類雙向(詢問擋不破關、提交正常過、求助不給方向、對貓繞職責), 貓味全程在、鞏固隱喻(B2)。
  **residual (極邊緣, 留觀)**: 「幫我提交X」偶爾 attemptedSolution null 靠 backfill 整句給 judge(judge 能解析, 不理想); 逗號句偶抽兩個 solve(第二個被 isSolved reject、不雙判)。
  **檔案**: turnHandler.ts(INTENT/NARRATION_SYSTEM_PROMPT 改、刪 handleTurn/SYSTEM_PROMPT/backfillSolution 死碼)。



- **F1**: 解謎成功 narration 模糊 → 明確說「解開了」+ 物理變化 + 因果。✅
- **F2**: 動作不通只回「沒反應」→ in-character 說明 + location guidance。✅
- **F11**: 詭異動作 (吃鑰匙/跟椅子說話) plain refusal → in-character 詭異接受, state 不變。✅
- **F15**: solution 格式 parsing + 反問確認流程 (Discord 版)。✅ (註: TS port 退化, 見 F-web-f15退化)
- **F-hint**: 玩家問線索被當 injection 拒絕 → in-character hint, 不 spoil。✅ **(後廢除, 2026-06-02)**: 此 F-hint 給「往答案方向推一把」的 in-character hint, 與後來確立的 persona 邊界「貓不評判/不提示、玩家負責推理」矛盾。四拍重構後其詳細規則已成死碼(handleTurn), 活著的只剩 NARRATION_SYSTEM_PROMPT 兩行「提示請求」, 也與 persona 硬約束打架。**已清**: 移除兩行提示請求 + 刪死碼。新邊界下求助型輸入 → 貓「我不知道、你自己推敲、把想試的捏包子給我」, 不給方向。卡住的解法回到「謎題本身可推」(generator 品質 / Phase3 因果圖), 不靠貓補救。見已解區「F-intent-boundary」。

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
  **三輪 bug (全靠加 log 抓 runtime 定位, 非讀 code —— 核心 insight 3)**:
  1. **登入 404**: `/sign-in` route 不存在 (Clerk 走 hosted UI), 改 `<SignInButton forceRedirectUrl>`。
  2. **重玩「失敗」假象**: server action 裡 `redirect('/play')` 拋 NEXT_REDIRECT error, 從 client component event handler 呼叫時被 `catch` 攔下顯示「重玩失敗」, navigation 沒發生。改: server action 回傳 `{status:'ok'}`, client 自己 `router.push`。**教訓: Next.js redirect() 在 server action 裡是用「丟特殊 error」實作的, client try/catch 會誤殺。**
  3. **重玩跳到開新場景**: /play 本來沒有「讀現有 world_states 進遊戲」的 on-mount 邏輯 (進頁就是從按鈕開始), startReplay 存了快照但 /play 沒讀。加 `?replay=1` useEffect → getCurrentState 載入。
  **端到端驗過**: 電腦 + 手機 (無痕換帳號), A 通關分享 → B 載 A 那關乾淨初始 (turnCount 0) → B 自己玩通關 (同關 diverge: A 21 turns / B 14 turns) → B 卡也能再重玩。
  **檔案**: schema.ts、drizzle/migrations/0003_*、sessionStore.ts、engine/index.ts、actions.ts、s/[shareId]/page.tsx、s/[shareId]/ReplayCTA.tsx。
  **註**: production 與 local 共用同一 Neon DB (endpoint ep-snowy-meadow-aol7b1yb), migration 已 apply。

- **F-mobile-viewport** [web 特有, 追蟲教訓重要]: 手機 (尤其 LINE in-app browser) 鍵盤 / iOS 系統 UI (靈動島、通話列) 出現時, 遊戲版面「跑掉」—— 整頁可橫向左右滑、canvas 右側露空白、捏按鈕被推出畫面切掉。
  **根因**: canvas、輸入列、prefill chip、popup 的寬度都吃 **layout viewport** (402)。iOS 鍵盤 / 系統 UI 只壓縮 **visual viewport** (縮成 352)、**layout viewport 不變**。於是 402 寬的內容 > 352 可視區 → iOS 允許橫向捲動。**canvas 尺寸本身一直正常 (370 穩定), 問題是內容綁錯 viewport 來源。**
  **修 (整頁綁 visual viewport)**: JS 監聽 visualViewport, 把 `visualViewport.width` 寫入 CSS 變數 `--vvw`; PlayPage wrapper + 所有內容寬度綁 `min(原 maxWidth, var(--vvw))`; canvas 偏移用 `--vvml` (margin-left) 修正 (原 `margin:0 auto` 是相對 layout viewport 402 置中, 在 352 可視區裡偏右); `body overflow-x:hidden` 當保險; 桌面 fallback (--vvw/--vvml 未設) 維持原 `margin:auto`/100%。✅
  **追蟲教訓 (這隻躲了十幾版, 值得記)**: 現象「手機版面亂」與根因「內容綁 layout viewport」隔很遠。一路誤判: 先以為是讀回覆框 (sheet) 定位 → 改 bottom sheet → visualViewport 重定位 sheet → ResizeObserver 寬度過濾 → scrollTo 歸位 → 才靠**畫面 debug overlay 印出 innerW/clientW/vvW/containerW/canvas 各寬度**, 一眼看出 canvas (370) 沒壞、是整頁內容超出縮小的可視區。**未來類似症狀: 別從 sheet/canvas 開始追, 直接看「內容寬度綁的是 layout 還是 visual viewport」+ 用畫面 overlay 印實際值。** (= 核心 insight 3「加 log 抓 runtime」的手機版。)
  **跨裝置未驗 (重要)**: 整套修法只在 iPhone + LINE 驗過。其他 iPhone / Android / iPad / 各 in-app browser (IG/FB/Messenger) / 橫向**未驗證**, 且修法含寫死數字 (padding 16、容差) 是風險點。**主動傳播 (PTT/Reddit/HN) 前該系統性驗一輪** — 陌生人裝置雜, 歪掉直接傷第一印象/viral。
  **連帶**: 手機旁白框改底部 sheet + 打字 (input focus) 時收起 (visualViewport 高度定位試過不穩, 改 focus 收起繞開 iOS 鍵盤坑); 剩餘 fit 見 F-mobile-fit。

---

## Findings — 待辦

### F-stonedoor (石門事件 2026-06-02): 拆成 A(回合處理流程, 四拍已解) + B(generator 謎題品質, 待辦)

**事件**: 玩家答謎語「何物無聲卻能言?」(正解「知識」)答「文字」, LLM narrate「石門開啟」(假 solve, 可能沒 emit solve_puzzle); 玩家「前往閱覽室」, ruleEnforcer 正確 reject move_player(閱覽室被 stone-door-lock 鎖、isSolved=false), 但 narration「你穿過石門來到閱覽室」照樣入 history → 下回合 LLM 讀到自己假話繼續演(snowball)。DB 實證 currentLocationId=reception-hall。chip 列「前往閱覽室」是對的(engine 認為還沒到), LLM 在說謊。prefill chip 再次當照妖鏡揪出 engine 穿透。

**關鍵: 這 bug 混了兩個不同源的問題, 要分開看 ——**

- **A (回合處理流程)**: LLM 演假成功、narration 領先 state、snowball。根: engine 把 narration 當 state 變更依據、而非反過來。同族 F-web-鎖門穿透 / F-web-假結局 —— 一個個修是打地鼠(修過鎖門穿透/假結局, 石門又用「假solve+假move」新組合穿透), 該根治。
  **✅ 已解 (四拍重構 2026-06-02, 見已解區 F-turnloop-v2)**: 回合處理改「意圖→判定→敘述」四拍, narration 永遠在 state 定案後生, judge 三路判定 + acknowledgedOutcomes 交叉核查。假 move / 假 solve / snowball 從結構消除(殘留只剩「模糊暗示」細縫, prompt 壓 + 實玩抓)。

- **B (generator 謎題品質)**: 那謎題本身是腦筋急轉彎(「何物無聲卻能言」答案發散: 知識/智慧/書/回音/文字...), 玩家答「文字」其實不算亂答, 是謎題太發散、答案不唯一。這跟 A 無關, 是 generator 生謎題的品質問題。**judge 再好救不了爛謎題** —— 謎題答案越發散, judge 越難判「對/近義/錯」(連正解都不唯一)。
  **待辦**: generator prompt 要求謎題「答案明確、可從場景線索推出」, 避免腦筋急轉彎 / 答案發散的謎語。同族 F-spoil、謎題可解性(修1)、Phase 3 因果圖(謎題形式化、答案可驗證)。屬軸 B。

  **謎題品質演進 (壓測→止血→重壓測→實玩翻案, 2026-06-03)**:

  壓測 (15 場 30 題 + judge 18 組邊界, scripts/stress-gen.ts + test-judge.ts; 機械標命中、可推性人工判、不讓 LLM 自評) 定位出**問題全在 generator、不在 judge**, 三大類:
  1. **明文洩漏**: generator 把答案明文寫進描述、根本沒形成謎題 (石像描述直接寫「鷹蛇獅鱷」順序=答案; 書脊「拼出 VERITAS」)。玩家覺得沒在解謎/太淺。
  2. **詞彙不一致**: 答案與線索用不一致的詞、逼玩家做無線索轉換 (提示「夜空」答案要「星空」; judge 正確判 wrong → 玩家答合理答案被拒 = 唬爛感)。**這是 generator 挖的坑、不是 judge 的錯**。
  3. **多字答案順序**: 順序有意義時描述沒指定、或順序無意義卻要精確順序。
  (另偶有邏輯動機不通。)

  **judge 行為基本正確、不該動 (測完結論)**: 格式/空格/大小寫/分隔符 → solved; 真順序錯 → wrong; 近義/字詞轉換 (夜空→星空、自由→嚮往) → wrong, **這是對的 —— judge 一旦認近義就守不住答案明確性, 不該為救 generator 的坑而變寬**。

  **止血執行 (scenarioGenerator.ts)**: (a) prompt 三段 —— 禁明文洩漏 (兩問自檢: 不洩漏 + 不通靈的甜蜜點)、詞彙一致性 section、多字順序二選一; (b) **validateLexicalConsistency(ws)** —— solution 每個詞須在某 description 原字出現, 違規 continue 重生 (number-code skip、word/number/mixed sequence 的詞 token 須 verbatim)。**能力邊界 (註釋)**: includes 是「存在性檢查」非「有效性檢查」—— 擋得了「答案詞完全沒出現」(夜空vs星空), 擋不了短 token「碰巧出現」; 數字密碼線索充分性歸 prompt 禁洩漏那條。

  **重壓測判準: 不需為見人上 Phase 3** —— 三大問題從「常見」降到「偶發邊界」, 最易致唬爛的詞彙一致性被程式根治 (實機攔截重生驗過)。**兩個殘留邊界 (記錄、非現在修)**: (a) 括弧/列舉「順便」洩漏答案順序 (prompt 70% 漏掉的型態、LLM 沒意識到括弧就是答案); (b) 要遊戲外域知識 = 變相通靈 (北歐神話世界樹頂→底, 跟腦筋急轉彎同類)。

  **⚠️ 實玩翻案 (重要、推翻上面的樂觀)**: 扮陌生人實玩一場 10 turns 通關後發現 **dump 壓測低估了問題** —— dump 看著合理、實玩才現淺/邏輯不通。實玩才現的:
  - **format hint 缺數量/格式**: 給了順序依據卻沒明示「輸入幾個詞、怎麼分隔」, 玩家試錯。description 該明示數量+順序+格式三件套。
  - **假線索物件多**: generator 不分「功能物件 vs 純氛圍」, 把氛圍寫得像有功能 (examine 勾人措辭卻回「沒別的想說」) → 玩家鑽死路。在「捏包子問貓」交互裡更傷 (問一半得聳肩、稀釋核心互動)。
  - **排序依據邏輯不通**: 「向日葵 月光 由強至弱」—— 向日葵不是光源、無法比光照; 玩家靠常識猜中非推理。止血三類之外的第四類、grep 驗不到、prompt 難治。
  - **方法論教訓**: 「謎題品質的真證明是實玩解到通關, 非看 dump」。dump 乾淨 ≠ 實玩順利。「邏輯不通」作者實玩判斷 = **最常犯的錯之一、不是偶發** —— 這推翻「止血夠、過見人門檻」的樂觀, **觸發決定上 Phase 3**(見下)。

### Phase 3 因果圖 — 定位釐清 + 決定開做 (2026-06-03, 研讀 world-kernel spec)

> **對外定位、真正價值、能力邊界、missing-premise vs wrong-premise 拆分、時機** 見設計文件「Phase 3」段(定位釐清 2026-06-03)。此處只記 BACKLOG 本職的實作層細節 —— 參考來源、節點/邊映射、分階段、不搬什麼。

**參考**: 作者另一研究專案 world-kernel(`~/Desktop/GitHub/world-kernel`), L1 因果基板 / L2 語義投射 / L3 LLM 角色(對應其 Phase 1~6; Phase 7~12 是 LLM hallucination 分析, 不 port)。是 strategy/spec, 非可直接接的實作; 語言架構不同(OCaml/Racket/Python vs TS), Phase 3 是「借概念在 TS 重建」非「接 code」。
**能力邊界 (實作層, Claude Code 研讀確認)**: 因果圖 + path memory(Φ3 visited-set)+ provenance 全是**結構/追溯**層、**不驗語義**(world-kernel 哲學 meaning-not-in-L1)。path memory 是 provenance(知道結果怎麼產生)、非「驗結果對不對」。→ missing-premise 可達性程式根治(Phase 3 直接命中)、wrong-premise 治不了靠 generator 規則禁 domain-mapping 邊壓。(此拆分的完整論述見設計文件。)
**節點/邊映射 (Claude Code 設計)**: 節點=命題(ClueNode 玩家可觀察的事實 / InferenceNode 中間結論 / SolutionNode 答案), 非物件。邊帶 inferenceType(extract/combine/order-by-index 可程式驗; order-by-stated-rule/domain-mapping 不可、後者禁止)。PuzzleGraph 平行於 WorldState 輸出, 不取代。
**分階段**: 3a generator 輸出 PuzzleGraph + 可達性/路徑長度≥2 驗證(治 missing-premise、獨立可驗) → 3b 禁 domain-mapping + 擴 validateLexicalConsistency 驗 extract/combine → 3c judge 接 PuzzleGraph(答案命中 SolutionNode、減誤判) → 3d visibility 接 ClueNode 可觀察性。**先做 3a**。
**不搬**: on/off state、cascade/BFS 傳播、contested、overlay、L3 NPC 機制(已有貓四拍)、snapshot——謎題是 DAG + 一次性推導, 不需要這些。

#### 3a 實作 + 壓測結果 (2026-06-03, 完成)

**實作 (scenarioGenerator.ts + types.ts)**:
- PuzzleGraph schema(平行 WorldState、optional 向後相容): node 類型 clue(sourceRef 指 item/location id)/inference(中間結論)/solution; edge 帶 inferenceType(extract/combine/order-by-index/order-by-rule)+ groundingProof(引用哪段 description)。
- **獨立 LLM call 生圖**(WorldState 驗過後才呼叫, 非塞進 WorldState prompt)—— 避免升高 WorldState 生成 failure rate、圖失敗可獨立 debug、圖 prompt 拿已驗 WorldState 做 context。最壞 6 次 LLM call(原 3)。
- validatePuzzleGraphs: (a)solutionNode 存在且 type 對 (b)ClueNode.sourceRef 指向存在的 item/location (c)SolutionNode 從 ClueNodes 可達(前向 BFS, hyperedge: from 全 reachable 才激活 to) (d)最短路徑≥2(禁純 ClueNode 直達 SolutionNode)。違規 continue 重生。
- **拍板**: sourceRef 不允許 puzzle.id(只 item/location, puzzle.description 是機制說明非線索, 否則 LLM 把偽線索藏謎題描述繞過); retry 先整體重生(log 記 fail rate, 高再切「只 retry 圖」)。
- **能力邊界(註釋標)**: 可達性是「圖結構自洽」檢查, **非「圖真實對應遊戲線索」檢查**。LLM 知道答案, 會反向湊「可達+sourceRef 指真物件+grounding 字面有引用」但語意造假的圖。3a 程式擋不住這個, 要 3b(驗 grounding 對應 description 語意, 非只字面)。

**第一次壓測撞 bug + 修**: graph_fail rate 假性爆高 —— LLM 在 sourceRef 加前綴(item./items./item:/location.), 驗證 `ws.items[sourceRef]` 死查全 miss。修: prompt 規定 raw id 無前綴(正反例)+ 驗證端 strip 已知前綴(longest-first)再查(strip 事件 console.warn 留痕)。修後重跑前綴問題消失、graph_fail 基本不觸發、時間腰斬。

**重壓測 15 場人工審 groundingProof 結論 —— 3a 比預期強**:
- **~85% 題 groundingProof 真有 description 支撐、推理鏈乾淨**。之前那種明文洩漏(鷹蛇獅鱷)/詞不一致(夜空vs星空)/missing-premise(向日葵沒建強弱)幾乎消失。**機制驗證: 「畫圖+寫 grounding」這個自證要求, 逼 generator 把線索補進遊戲(省略=圖畫不出/grounding 寫不出)—— 比純可達性強, grounding 要求有實質約束力。** 例 Scene 14 rune-lock: 石刻給首尾、筆記給三符文集合 → InferenceNode 推「中間是冰」, 真推理鏈、grounding 都在。
- **~15% LLM 仍湊可達圖(grounding 字面有引用、語意牽強/造假)**: Scene 11 stabilizer「終端機需穩定碼、白板有穩定劑配方、共享『穩定』二字」= 文字遊戲牽強連結; Scene 15 reagent「夜空第二星→氖(10)」= 湊原子序、遊戲內無依據(domain-mapping 偽裝成 combine)。**3a 可達性放行(grounding 字面在), 正是 3b 要抓的(驗 grounding 語意對應, 非字面)。**
- **沒弄壞既有機制**: lexical(風林火山/心靜如水/水蜘蛛)正常擋、deadlock 正常抓、reward/visibility 正常。

**判準結論**: 3a 單獨治了 ~85% missing-premise、**過見人門檻**。3b(驗 grounding 語意)抓剩 ~15% 湊圖牽強案例, **非見人必需、是品質提升**。Phase 3 後續(3b/3c/3d)回到「核心驗證後深化」。

**3a 殘留 bug (小修, 記錄)**: fallback path(Level 1)沒跑 PuzzleGraph 生成 → Scene 8(lexical 擋三次 exhausted→fallback)的圖「⚠ 未生成」。fallback 場景本就簡單、不致命, 但 fallback 該補生圖或明確標記無圖。

#### 3a 驗證進度 + 邊界盤點 (2026-06-04, 未完成, 交接用)

**狀態: 3a 驗證未完成。** 任務是「驗 3a(實玩解到通關)→ 修 bug → merge main → 每步更新文件」, 卡在驗證階段。以下只記查證過/實玩過的事實 + 明確標待驗/開放, 不含推測。

**3a 改動的客觀邊界 (新 Claude Code diff main vs phase3-causal-graph, 非任何人記憶)**: 改 5 檔 ——
- `types.ts`: WorldStateSchema 加 puzzleGraphs(optional, 向後相容); 新增 PuzzleGraph 相關 Zod schema。
- `scenarioGenerator.ts`: generatePuzzleGraphs / validatePuzzleGraphs / generateAndValidateGraphs; 在 generateScenario 的 primary + recovery 路徑各插一次(驗證失敗 continue/fall-through → 下一 attempt)。
- `turnHandler.ts` **三處**(其中兩處跟因果圖無關, 是順手修的 bug): (1) safeContext 加 `delete data["puzzleGraphs"]`; (2) NARRATION_SYSTEM_PROMPT 改鎖門 + 查看物件兩條範例、刪「查看無物」範例; (3) buildEventSummary 的 examine_item 分支加 item description 行、move rejected 分支加 lock requires 行。
- `scripts/stress-gen.ts`: dumpPuzzleGraph(純 console 輸出, 無 runtime 影響)。
- `docs/BACKLOG.md`: 純文件。
- **puzzleGraphs 下游讀取點**: safeContext(已 delete, LLM 收不到)/ sessionStore(跟 ws 一起存 DB、load、initialState snapshot 都帶著)/ ruleEnforcer(structuredClone 帶著但不讀不改)/ toView(不含, 前端收不到)/ stress-gen(只讀)。

**邊界確認狀態**:
- ✅ **已確認(實玩/查證過)**: 向後相容(optional); safeContext strip puzzleGraphs; toView 不漏給前端; ruleEnforcer 不受影響。
- ✅ **兩個順手修的 engine bug(實玩驗過, 跟 3a 因果圖無關但在此 branch 一起改的)**:
  - **鎖門不呈現謎題要求**: puzzle.description 沒進 buildEventSummary 的 move rejected, 玩家不知鎖要什麼。修: event summary 加 lock requires + narration 範例帶出要求(說 what 不說 how、保持貓味)。實玩驗過(鎖門說出要求)。
  - **examine 不呈現 item.description**: examine 無 hidden children 的物件時 event summary 只給「nothing new revealed」(那只指 hidden children), item.description 沒進 event summary → narration 照「查看無物」範例迴避(主控台/維修日誌/石碑「沒新訊息」)。**根因是 event summary 缺 description, 跟鎖門同源「該呈現的資訊沒進 event summary、narration 靠 LLM 隨機」**(diagnosis 過程一度誤判為「重複 examine」「puzzleGraphs 污染」「3a regression」, 均非; safeContext strip 是必要但非此 bug 根因)。修: examine event summary 加 item description + 刪迴避範例。實玩驗過(石碑唸出「太陽月亮、天空的賜予」)。註: 每次 examine 都印 description, 重複 examine 會說「還是這些」(非 bug, 囉嗦, 暫不處理)。
- ⚠️ **待驗**:
  - **生成時間 3.9 分鐘(單場實測)**: 每場最壞 3 次 WorldState 重生 + PuzzleGraph call。這場兩次掛 lexical(五行字「金水火土」不在 description)整場重生。main 約 1 分鐘。**retry 當初拍板「先整體重生、fail rate 高再切只重生失敗部分」—— 現在 fail rate 高、時間爆, 該切。這是 merge 見人的硬阻擋(玩家等不了 4 分鐘)。** 未修。
  - **sessionStore: puzzleGraphs 進 DB + load + initialState snapshot 都帶著** —— 行為對不對未驗, 尤其 replay 載入帶著舊 puzzleGraphs(replay 歷來易連環追蟲)。未驗。
- ❓ **開放問題(待查證, 別推測)**:
  - **跳謎題通關**: 實玩第二場(植物方舟)只解一個謎題(密語「麥豆粟米」)就通關, 另一謎題(壓力閥 25/50/35)沒解、且主控台 narration 說「沒電」卻能輸密語成功。**diff 顯示 3a 沒碰 ruleEnforcer 的通關條件/謎題依賴**, 所以這大概率不是 3a, 是 engine 既有的通關條件/謎題依賴層。**待查: main 是否也能跳謎題通關(若是 = pre-existing 非 3a)**。
  - **chip 不更新(visibility 揭露鏈)**: 換場景/examine 揭露後 chip 沒反映當前 visible 物件(作者指: hidden→shown 觸發時、每輪都該更新 chip)。Claude Code diff 確認 chip 程式碼(page.tsx/BunCatScene.tsx/actions.ts)3a 沒碰 → **pre-existing 非 3a**。屬 F-visibility 待補延伸。Claude Code 已加 log(toView/handleAction/suggestions), 待實際 examine 有 hidden child 的家具看三組 log 定斷點(server toView / React memo / 渲染)。**注意: 重生場景不保證生出有 hidden child 的場景(generator 生 belongsTo 比例不穩), 靠重生碰運氣驗不可靠 + 每場 3.9 分鐘 → 宜用固定 fixture/replay 已知有 hidden child 的場景驗。**

**3a 實玩驗證兩場結果(對照壓測 dump ~85% 乾淨/~15% 湊圖)**:
- 第一場(三聖物天空到大地): 玩家推不出「要輸入什麼」—— 中間聖物(蛇)無遊戲內線索建立、輸入格式(物件名 vs 象徵)不明 = missing-premise/湊圖, 3a 沒擋(屬已知 ~15%, 留 3b)。
- 第二場(植物方舟): 單謎題線索夠(密語可推), 但撞「跳謎題通關」(見開放問題)。
- **啟示**: 印證作者標準「謎題品質的真證明是實玩解到通關, 非看 dump」—— dump ~85% 乾淨 ≠ 實玩順利通關, 因為擋通關的不只 3a 那塊(還有 wrong-premise/湊圖殘留=3b、謎題依賴/通關條件=engine 既有層、生成時間)。**3a 是單謎題可解性的一塊, 單獨不足以讓「實玩通關體驗」達標。**

**merge 決策(未拍板)**: 生成時間 3.9 分鐘 + 跳謎題通關待查 + sessionStore/replay 待驗 → 現狀不宜直接 merge 見人。傾向(未拍板): main 維持止血版見人(生成快、examine 正常)、3a 留 branch 解生成時間 + 驗 sessionStore + 做 3b, 再整批 merge。branch phase3-causal-graph 已 push(upstream 設好), main 未動。

**交接注意(這段 session 的教訓, 給下個 session)**: 查 bug 根因要憑 runtime 證據(真實 prompt/log/diff), 「讀 code 推測出的根因」這段 session 錯了多次(examine 連續誤判三套)。作者陳述的實機事實(哪版 work/壞)優先於 code 推測。3a 範圍 = generator 輸出 PuzzleGraph + 驗證, 影響整個 generator 謎題系統(非僅可達性檢查)。建議下個 session + 新 Claude Code 都開乾淨的, 對著上面 diff 邊界清單逐條確認, 別帶舊推測。



**驗證啟示**: 「石門復現」很難測, 因為要同時湊齊 B(爛謎題)+ 模糊答案 + A(演成功)。但不需要復現石門來驗 A —— A 的驗證走「假 move 防守」(直接前往鎖房 → 看 narration 演不演穿越、currentLocationId 變不變、snowball 不 snowball, 不依賴謎題品質, 純戳四拍)+「judge 三路用答案明確的謎題測」(把謎題爛這變數拿掉、單驗 judge 準度)。

### F-visibility (🔄 partial — 核心已解、生成比例待多場實測): visibility 模型

**核心已解 (2026-06-02, 實作見已解區 F-visibility)**: 原本 engine 沒有「物件被發現了沒」的概念、物件結構全平、進房全可見、「查看」不改 state。已補:Item 加 hidden + belongsTo(hidden 由 belongsTo 推導、LLM 只填 belongsTo);examine 家具 promote hidden children;toView/context 依 visibility 篩。單場實玩驗過「掀床→枕頭底下藏照片」(會生 belongsTo、examine reveal 真的跑)。

**怎麼被揪出 (教訓保留)**: prefill 查看 chip 從 sceneItems 生成、把「查看便條」白紙黑字攤在玩家眼前無法繞過,narration 軟把關含糊、chip 是明確列表 → 必穿。**prefill 當照妖鏡, 同 M2 tap UI 揭穿隱形 engine bug。**

**同族 root cause (教訓保留)**: 跟 F-web-鎖門穿透、F-web-孤兒item 同一教訓 —— **LLM 軟性把關擋不住明確 UI / state 缺欄位**(= 核心 insight 1 的反面根因)。

**🔄 待驗 (為何還是 partial、不是 ✅)**:
- **generator 生 belongsTo 的比例穩不穩 —— 需多場實測累積**。單場只證「會生、真用」, 生得夠不夠、穩不穩沒驗。比例不穩 → 探索層次時有時無。
- **reward 的 solve 揭露路徑未做**: visibility 只做了一條揭露路徑(belongsTo 家具 + examine),「reward 解謎後才出現」這條沒做 → reward 提前可見(劇透)。見 F-reward-reveal。
- 做穩後 prefill 查看 chip 改依 visible 過濾(現 chip 暫留、標已知缺陷)。

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

### F-idle-hint (待辦, 軸 B 引導, 低成本): 捏了包子但長時間沒射出 → 提示

**現象 / 來源**: 實玩時誤觸 —— 捏了包子但沒射出(包子停在彈弓上), 玩家以為在等貓回應、其實是自己還沒射 → 誤以為卡住。沒有信號告訴玩家「包子還在彈弓上、你還沒射、貓在等你」。
**要做**: 捏了包子但長時間 idle(沒射出)→ 給不打擾的提示(彈弓高亮 / 箭頭 / 文字「拉彈弓把包子射給貓」之類), 讓玩家知道球在他這邊、去射。
**一石二鳥**: (1) 防誤觸誤判卡死; (2) 新手引導 —— 新玩家可能不知道「捏完要拉彈弓射」, idle 提示順便教。
**同精神**: 跟 prefill chip(空框才顯示、不打擾)同設計精神 —— 玩家閒置/不知道下一步時, 給不打擾的提示。這是那精神在「捏了沒射」狀態的延伸。
**定位**: 軸 B(引導/防流失), 低成本, 非阻斷。

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

### F-reward-reveal (待辦, visibility 第二條揭露路徑, 依賴四拍 solve): reward item 解謎前就可見

**現象 (實機 2026-06-02)**: 發電機謎題的獎勵「權限卡」, 玩家解謎(輸入數字)**之前**進房就在 chip 看到「查看權限卡」—— reward 在解謎前 top-level 可見, 提前洩漏「解謎有獎勵」(劇透)。解謎後 narration 才說「彈出權限卡」, 但卡早就看得到。

**根因**: visibility 只做了一條揭露路徑 —— belongsTo 家具 + examine 才 reveal。但「reward 解謎後才出現」是另一條 —— 綁 puzzle + solve 才 reveal, **這條沒做**。所以 generator 把權限卡生成 top-level(belongsTo:null → 推導 hidden:false)→ 一進房可見。visibility 只做了一半(examine 揭露有、solve 揭露無), reward 掉進沒涵蓋的縫。

**作者已定**: 要「解謎後才出現、解謎前完全看不到」(非「一直可見但鎖著」)。

**方向 (架構級, 先說明再寫)**: 擴展 visibility 揭露來源。
- schema: reward item 加獨立欄位 revealedByPuzzle: puzzleId (別混進 belongsTo —— belongsTo=examine 揭露、revealedByPuzzle=solve 揭露, 兩路分清)。
- hidden 推導擴展: hidden = (belongsTo != null || revealedByPuzzle != null), 仍 deriveHiddenFields 推導、LLM 不填 hidden。
- 揭露時機: 接四拍的 solve_puzzle apply 之後 —— judge solved → apply → promote 所有 revealedByPuzzle === 該 puzzleId 的 hidden items。
- generator: reward 填 revealedByPuzzle 指向獎勵的 puzzle; validateScenarioLogic 驗該 puzzle 存在。

**時機 (重要)**: 接在四拍的 solve apply 之後 → **依賴四拍 solve 流程是對的**。四拍剛上、solve(judge+apply)還沒實玩驗。**先驗四拍 solve 通, 再把 reward promote 接上去** —— 否則 reward promote 疊在未驗的 solve 上, 出錯難隔離。非阻斷(提前可見是劇透/體驗, 不擋通關), 排四拍驗穩後。同 F-orphan 是 reward 的兩面(F-orphan=沒用途、本條=提前可見)。

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
- **ReplayCTA 兩按鈕大小不一**: 「挑戰 EscapeBot →」比「重玩這一關」大 (寬高不一致)。純 CSS 對齊。(註: 按鈕現文字「EscapeBot」是對外顯示名,待統一為 Cat Got Your Words —— code/UI 改動,不在文件範圍。)
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