# M4b — 分享卡完整化(視覺設計 + 重玩)

> **M4b 原始定義(5/27 定的)= 分享卡的最終視覺風格,跟 M3 的貓 / pixel-art 對齊。** M4a 視覺先用簡單版(乾淨字卡),等 M3 風格定了再於 M4b 美化、對齊。
>
> 本 spec 把 M4b 分成兩塊:**A. 視覺設計(原始定義)** + **B. 重玩這一局(分享連結變進入點)**。
>
> (若要把 B 拆成獨立 milestone、M4b 只留視覺,講一聲即可改。)
>
> (「開新一局」已隨 M4a 完成——分享頁已有「挑戰 EscapeBot」CTA、`/play` 已有「開始新場景」——不在此重做。)

---

## A. 視覺設計(M4b 原始定義)

把分享卡的視覺從「簡單版」做到最終、跟 M3 的貓 / pixel-art 風格對齊。

- **來源(5/27)**:M4a 刻意先用簡單版(乾淨字卡:主題框 + 金句大字 + `EscapeBot · N turns` 署名);M3 的視覺(貓 / 場景 / pixel-art)定了之後,在 M4b 美化分享卡、跟 M3 對齊。
- **現況 nuance(5/30)**:那張極簡金句卡其實已經夠好看、夠穩。所以 M4b 視覺**不一定要大改**,M3 風格定了後可能只需**小幅對齊**(例如加個貓的角落圖示、色調呼應 M3 暖色 pixel-art),不用重做。
- **觸發**:M3 的視覺風格定了之後做(否則沒有對齊的對象)。
- **範圍**:純視覺。不碰分享資料 / 防偽 / engine。
- **不要踩的**:別為了「對齊」把已經好看的極簡卡改壞;先確認 M3 風格,再決定要不要動、動多少。

---

## B. 重玩這一局(分享連結變進入點)

> **✅ 已完成(2026-06-02)。** 本段以下是原始 spec(設計推理);實作落地細節、三輪 bug 與追蟲教訓記在 BACKLOG 的 F-replay(已解區)。重點落地:initialState 在 generate 當下抓、存 shares(append-only)+ world_states、startReplay → `?replay=1` 載入、可傳遞 A→B→C。端到端驗過(A 21 turns / B 同關 14 turns diverge)。

讓打開分享連結的人能**親自玩分享者 A 玩過的同一關**(同房間/物品/謎題/win condition),自己玩自己的。服務「值得分享 = viral」——把看的人拉進來玩 A 那個世界。

### 現況(已查清的事實)

- **`shares` 表(M4a)**:`{ shareId, clerkUserId, scenarioTitle, quote(金句), turnCount }`。createShare 通關後跑,只存**卡片要顯示的衍生欄位**,不是整個 scenario。
- **`world_states` 表 + sessionStore**:每 user **一筆** `world_states`(`state: jsonb` 完整 WorldState),**每回合 / 開新場景直接 overwrite**;sessionStore 只有 save/load/delete/getOrCreateUser,**沒有初始快照的存取**。
- **結論**:初始 scenario **目前沒被存在任何地方**(world_states 被覆寫成終局,shares 只存衍生欄位)。所以重玩要新增持久化,且**快照必須在 `generate()` 當下抓**(通關時 world_states 已是終局、撈不回初始)。

### 要做的事

1. **生成當下抓初始 WorldState 快照**(`generate()` 之後、玩家動之前),存進**寫一次不再被覆寫**的地方(例如 world_states 加 `initialState jsonb`,只在 generate 寫、turn 更新不動;或獨立快照表)。
2. **`createShare` 時把初始 scenario 複製 / 綁定進分享**(例如 shares 加 `initialState jsonb`),每個 share 帶自己那關的乾淨初始狀態。
3. **加「重玩」路由**:載入這份初始 WorldState → 開成 B 的新 session。

**不需要 seed 確定性生成、不需要 replay 引擎。** 要的不是重現 A 的操作,是把 A 那關的 JSON 存下來、重新載入給 B 玩。資料現成(generate 的產物),只是沒被保存。

### 為什麼這形態對(對著「值得分享 = 獨一無二瞬間」的尺)

1. **比 spectator(看別人解謎錄影)好**:看別人解謎對解謎遊戲很可能無聊,樂趣在自己的發現;spectator 還要錄整場 performance,工程重。重玩反過來——B 親自玩、自己發現,工程也輕。
2. **同關會 diverge,不是炒冷飯**:turn handler 是 live 的,同樣骨架但 B 輸入不同 → 敘述/詭異瞬間/貓的反應都不同。
3. **零 Echo 風險**:B 玩的是 A 那關的**乾淨副本**,不是被前人 ghost item 灌過的髒世界,不碰謎題可解性。
4. **viral 故事閉環**:A 的卡秀出詭異金句 → B 想「我自己進去看看」→ B 玩同一關、有自己的 run。

### 技術要點(別踩的坑)

- 快照存**初始**狀態,不是結束狀態(分享卡通關後才生,那時是終局)。
- 不需要 seed 引擎(存 JSON + reload)。
- 重玩載入的是**乾淨副本**——和 Echo 的「注入污染」是兩回事。
- 輕微劇透可接受(卡是故事卡不是解答卡,LLM 層會重新發散)。

---

## 仍待確認(code 層,transcript 看不到,勿假設)

- `shares` / `world_states` 確切欄位(schema 來源有截斷)——以實際檔為準。
- B1 的「挑戰 EscapeBot」CTA 目標有沒有導到 `/play`(M4a 收尾的小確認)。

---

## 與其他東西的關係

- **Spectator / replay performance(ChatGPT 提案)→ 被 B(重玩)取代**(對解謎遊戲更對、更輕)。
- **Echo influence(注入前人痕跡污染世界)→ Phase 3**(需因果圖底層才能吸收外來注入又保證可解)。B 的重玩**不是** Echo。
- **卡片內容增量(卡上加 1–3 個詭異瞬間 + 貓狀態,呼應 BACKLOG F11 archive)**:對準成功指標、零污染的相鄰增量,可和 A/B 一起做,但**尚未拍板**——先記為相鄰可選項。

---

## 交給 escapebot-web Claude Code 時

- **A(視覺)**:配合 M3 定案的風格做,純前端視覺,可直接做(但先確認 M3 風格、別把好看的卡改壞)。
- **B(重玩)**:涉及 DB schema + engine session 持久化,屬架構級 → 用「**先說明方向(schema + 載入流程)再動手**」的 gate。寫**完整自足的 prompt**:建立在 M4a `shares` 之上、初始快照要在 `generate()` 當下抓、不需 seed 引擎。

---

## Phase / 優先級

- 都在 Phase 2。
- **A 視覺**:等 M3 視覺風格定了再做(可能只需小幅對齊)。
- **B 重玩**:✅ **已完成(2026-06-02)**。不碰謎題可解性,與 Phase 3 因果圖工作互不衝突。實作見 BACKLOG F-replay。