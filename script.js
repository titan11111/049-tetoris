/**
 * テトリス - ガイドライン準拠実装
 * バニラJS + HTML5 Canvas
 */

(function() {
    'use strict';

    // ===== 定数定義 =====
    const CELL_SIZE = 24;
    const COLS = 10;
    const ROWS = 20;
    const SPAWN_ROW = 2;
    const CANVAS_WIDTH = COLS * CELL_SIZE;
    const CANVAS_HEIGHT = ROWS * CELL_SIZE;

    // DAS/ARR設定
    const DAS_DELAY = 150; // ms
    const ARR_DELAY = 33; // ms
    const SOFT_DROP_MULTIPLIER = 20;
    const LOCK_DELAY = 500; // ms
    const MAX_LOCK_RESETS = 15;

    // スコア定数
    const SCORES = {
        SINGLE: 100,
        DOUBLE: 300,
        TRIPLE: 500,
        TETRIS: 800,
        TSPIN_MINI: 100,
        TSPIN_MINI_DOUBLE: 200,
        TSPIN_SINGLE: 800,
        TSPIN_DOUBLE: 1200,
        TSPIN_TRIPLE: 1600,
        SOFT_DROP: 1,
        HARD_DROP: 2,
        B2B_MULTIPLIER: 1.5,
        COMBO_BONUS: 50
    };

    // レベル別重力速度（フレーム数）
    const LEVEL_SPEEDS = [
        1000, 793, 618, 473, 355, 262, 190, 135, 94, 64,
        43, 28, 18, 11, 7, 4, 3, 2, 1, 1
    ];

    // テトロミノ定義
    const TETROMINOS = {
        I: { color: '#00f0f0', matrix: [[1,1,1,1]] },
        O: { color: '#f0f000', matrix: [[1,1],[1,1]] },
        T: { color: '#a000f0', matrix: [[0,1,0],[1,1,1]] },
        S: { color: '#00f000', matrix: [[0,1,1],[1,1,0]] },
        Z: { color: '#f00000', matrix: [[1,1,0],[0,1,1]] },
        J: { color: '#0000f0', matrix: [[1,0,0],[1,1,1]] },
        L: { color: '#f0a000', matrix: [[0,0,1],[1,1,1]] }
    };

    const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

    // SRS回転システム - キックテーブル
    const SRS_KICKS = {
        STANDARD: {
            '0->1': [[-1,0], [-1,-1], [0,2], [-1,2]],
            '1->0': [[1,0], [1,1], [0,-2], [1,-2]],
            '1->2': [[1,0], [1,1], [0,-2], [1,-2]],
            '2->1': [[-1,0], [-1,-1], [0,2], [-1,2]],
            '2->3': [[1,0], [1,-1], [0,2], [1,2]],
            '3->2': [[-1,0], [-1,1], [0,-2], [-1,-2]],
            '3->0': [[-1,0], [-1,1], [0,-2], [-1,-2]],
            '0->3': [[1,0], [1,-1], [0,2], [1,2]]
        },
        I: {
            '0->1': [[-2,0], [1,0], [-2,1], [1,-2]],
            '1->0': [[2,0], [-1,0], [2,-1], [-1,2]],
            '1->2': [[-1,0], [2,0], [-1,-2], [2,1]],
            '2->1': [[1,0], [-2,0], [1,2], [-2,-1]],
            '2->3': [[2,0], [-1,0], [2,-1], [-1,2]],
            '3->2': [[-2,0], [1,0], [-2,1], [1,-2]],
            '3->0': [[1,0], [-2,0], [1,2], [-2,-1]],
            '0->3': [[-1,0], [2,0], [-1,-2], [2,1]]
        }
    };

    // ===== ゲーム状態 =====
    let gameState = {
        board: new Uint8Array(ROWS * COLS),
        currentPiece: null,
        holdPiece: null,
        canHold: true,
        nextPieces: [],
        bag: [],
        score: 0,
        highScore: 0,
        level: 1,
        lines: 0,
        combo: -1,
        b2b: false,
        lastWasSpecial: false,
        gameOver: false,
        paused: false,
        dropTimer: 0,
        lockTimer: 0,
        lockResets: 0,
        isLocked: false
    };

    // 入力状態
    let input = {
        keys: {},
        leftTime: 0,
        rightTime: 0,
        downTime: 0,
        leftPressed: false,
        rightPressed: false,
        downPressed: false
    };

    // Canvas要素
    let gameCanvas, gameCtx, holdCanvas, holdCtx, nextCanvas, nextCtx;
    let lastTime = 0;
    let animationId;

    /**
     * ゲーム初期化
     */
    function init() {
        // Canvas要素取得
        gameCanvas = document.getElementById('gameCanvas');
        gameCtx = gameCanvas.getContext('2d');
        holdCanvas = document.getElementById('holdCanvas');
        holdCtx = holdCanvas.getContext('2d');
        nextCanvas = document.getElementById('nextCanvas');
        nextCtx = nextCanvas.getContext('2d');

        // 高DPI対応
        setupHighDPI(gameCanvas, gameCtx);
        setupHighDPI(holdCanvas, holdCtx);
        setupHighDPI(nextCanvas, nextCtx);

        // イベントリスナー設定
        setupEventListeners();

        // ハイスコア読み込み
        loadHighScore();

        // ゲームリセット
        reset();

        // ゲームループ開始
        gameLoop(0);
    }

    /**
     * 高DPI対応設定
     */
    function setupHighDPI(canvas, ctx) {
    const pixelRatio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // Reset transform to avoid cumulative scaling on resize
    if (typeof ctx.resetTransform === 'function') {
        ctx.resetTransform();
    } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
    ctx.scale(pixelRatio, pixelRatio);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
}

// Resize handler to re-sync DPI and redraw
function handleResize() {
    if (!gameCanvas || !gameCtx || !holdCanvas || !holdCtx || !nextCanvas || !nextCtx) return;
    setupHighDPI(gameCanvas, gameCtx);
    setupHighDPI(holdCanvas, holdCtx);
    setupHighDPI(nextCanvas, nextCtx);
    render();
}


    /**
     * イベントリスナー設定
     */
    function setupEventListeners() {
        // キーボードイベント
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        // モバイルボタン
        function bindButton(id, key) {
            const btn = document.getElementById(id);
            const start = e => { e.preventDefault(); simulateKey(key, true); };
            const end = e => { e.preventDefault(); simulateKey(key, false); };
            btn.addEventListener('touchstart', start, { passive: false });
            btn.addEventListener('touchend', end);
            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', end);
            btn.addEventListener('mouseleave', end);
        }
        function bindTap(id, handler) {
            const btn = document.getElementById(id);
            const tap = e => { e.preventDefault(); handler(); };
            btn.addEventListener('touchstart', tap, { passive: false });
            btn.addEventListener('click', tap);
        }
        bindButton('leftBtn', 'ArrowLeft');
        bindButton('rightBtn', 'ArrowRight');
        bindButton('downBtn', 'ArrowDown');
        bindTap('rotateBtn', () => rotatePiece(1));
        bindTap('holdBtn', holdCurrentPiece);
        bindTap('hardDropBtn', hardDrop);
        bindTap('pauseBtn', togglePause);
        bindTap('resetBtn', reset);

        // マウスイベント防止
        document.addEventListener('contextmenu', e => e.preventDefault());
    
// 画面サイズ・向きの変化に追従
window.addEventListener('resize', handleResize, { passive: true });
window.addEventListener('orientationchange', handleResize);
}

    /**
     * モバイルボタン用キーシミュレーション
     */
    function simulateKey(key, pressed) {
        input.keys[key] = pressed;
        if (key === 'ArrowLeft') {
            input.leftPressed = pressed;
            if (!pressed) input.leftTime = 0;
        } else if (key === 'ArrowRight') {
            input.rightPressed = pressed;
            if (!pressed) input.rightTime = 0;
        } else if (key === 'ArrowDown') {
            input.downPressed = pressed;
            if (!pressed) input.downTime = 0;
        }
    }

    /**
     * キーダウンハンドラ
     */
    function handleKeyDown(e) {
        if (gameState.gameOver && e.key !== 'r') return;
        if (gameState.paused && e.key !== 'p') return;

        input.keys[e.key] = true;

        switch(e.key) {
            case 'ArrowLeft':
                if (!input.leftPressed) {
                    movePiece(-1);
                    input.leftPressed = true;
                    input.leftTime = DAS_DELAY;
                }
                break;
            case 'ArrowRight':
                if (!input.rightPressed) {
                    movePiece(1);
                    input.rightPressed = true;
                    input.rightTime = DAS_DELAY;
                }
                break;
            case 'ArrowDown':
                if (!input.downPressed) {
                    input.downPressed = true;
                    input.downTime = ARR_DELAY;
                }
                break;
            case 'z':
                rotatePiece(-1);
                break;
            case 'x':
                rotatePiece(1);
                break;
            case 'a':
                rotatePiece(2);
                break;
            case ' ':
                e.preventDefault();
                hardDrop();
                break;
            case 'c':
                holdCurrentPiece();
                break;
            case 'p':
                togglePause();
                break;
            case 'r':
                reset();
                break;
        }
    }

    /**
     * キーアップハンドラ
     */
    function handleKeyUp(e) {
        input.keys[e.key] = false;

        switch(e.key) {
            case 'ArrowLeft':
                input.leftPressed = false;
                input.leftTime = 0;
                break;
            case 'ArrowRight':
                input.rightPressed = false;
                input.rightTime = 0;
                break;
            case 'ArrowDown':
                input.downPressed = false;
                input.downTime = 0;
                break;
        }
    }

    /**
     * ゲームリセット
     */
    function reset() {
        gameState.board.fill(0);
        gameState.currentPiece = null;
        gameState.holdPiece = null;
        gameState.canHold = true;
        gameState.nextPieces = [];
        gameState.bag = [];
        gameState.score = 0;
        gameState.level = 1;
        gameState.lines = 0;
        gameState.combo = -1;
        gameState.b2b = false;
        gameState.lastWasSpecial = false;
        gameState.gameOver = false;
        gameState.paused = false;
        gameState.dropTimer = 0;
        gameState.lockTimer = 0;
        gameState.lockResets = 0;
        gameState.isLocked = false;

        // 初期ピース生成
        for (let i = 0; i < 5; i++) {
            gameState.nextPieces.push(getNextPiece());
        }

        spawnPiece();
        updateUI();
        hideOverlays();
    }

    /**
     * 7バッグランダムシステム
     */
    function getNextPiece() {
        if (gameState.bag.length === 0) {
            gameState.bag = [...PIECE_TYPES];
            shuffle(gameState.bag);
        }
        return gameState.bag.pop();
    }

    /**
     * 配列シャッフル
     */
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * ピース生成
     */
    function spawnPiece() {
        const pieceType = gameState.nextPieces.shift();
        gameState.nextPieces.push(getNextPiece());

        const x = Math.floor(COLS / 2) - 2;
        const y = -SPAWN_ROW;

        gameState.currentPiece = {
            type: pieceType,
            x: x,
            y: y,
            rotation: 0
        };

        gameState.canHold = true;
        gameState.lockTimer = 0;
        gameState.lockResets = 0;
        gameState.isLocked = false;

        // スポーン時衝突チェック（ゲームオーバー）
        if (!isValidPosition(x, y, 0, pieceType)) {
            gameState.gameOver = true;
            saveHighScore();
            showGameOverOverlay();
            playSound('gameOver');
        }
    }

    /**
     * 有効位置チェック
     */
    function isValidPosition(x, y, rotation, pieceType) {
        const matrix = getRotatedMatrix(pieceType || gameState.currentPiece.type, rotation);
        
        for (let py = 0; py < matrix.length; py++) {
            for (let px = 0; px < matrix[py].length; px++) {
                if (matrix[py][px]) {
                    const nx = x + px;
                    const ny = y + py;
                    
                    if (nx < 0 || nx >= COLS || ny >= ROWS) {
                        return false;
                    }
                    
                    if (ny >= 0 && gameState.board[ny * COLS + nx]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * 回転したマトリクスを取得
     */
    function getRotatedMatrix(pieceType, rotation) {
        const matrix = TETROMINOS[pieceType].matrix;
        let rotated = matrix;
        
        for (let i = 0; i < rotation; i++) {
            rotated = rotateMatrixCW(rotated);
        }
        
        return rotated;
    }

    /**
     * マトリクス時計回り回転
     */
    function rotateMatrixCW(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const rotated = [];
        
        for (let x = 0; x < cols; x++) {
            rotated[x] = [];
            for (let y = 0; y < rows; y++) {
                rotated[x][y] = matrix[rows - 1 - y][x];
            }
        }
        
        return rotated;
    }

    /**
     * ピース移動
     */
    function movePiece(dx) {
        if (!gameState.currentPiece || gameState.gameOver || gameState.paused) return;

        const newX = gameState.currentPiece.x + dx;
        if (isValidPosition(newX, gameState.currentPiece.y, gameState.currentPiece.rotation)) {
            gameState.currentPiece.x = newX;
            if (gameState.isLocked) {
                resetLockTimer();
            }
        }
    }

    /**
     * ピース回転
     */
    function rotatePiece(direction) {
        if (!gameState.currentPiece || gameState.gameOver || gameState.paused) return;

        const piece = gameState.currentPiece;
        let newRotation = (piece.rotation + direction + 4) % 4;
        
        if (direction === 2) { // 180度回転
            newRotation = (piece.rotation + 2) % 4;
        }

        // SRSキックテスト
        const kickTable = piece.type === 'I' ? SRS_KICKS.I : SRS_KICKS.STANDARD;
        const kickKey = `${piece.rotation}->${newRotation}`;
        const kicks = kickTable[kickKey] || [[0, 0]];

        for (let [dx, dy] of [[0, 0], ...kicks]) {
            const testX = piece.x + dx;
            const testY = piece.y + dy;
            
            if (isValidPosition(testX, testY, newRotation)) {
                piece.x = testX;
                piece.y = testY;
                piece.rotation = newRotation;
                if (gameState.isLocked) {
                    resetLockTimer();
                }
                return;
            }
        }
    }

    /**
     * ロックタイマーリセット
     */
    function resetLockTimer() {
        if (gameState.lockResets < MAX_LOCK_RESETS) {
            gameState.lockTimer = 0;
            gameState.lockResets++;
            gameState.isLocked = false;
        }
    }

    /**
     * ハードドロップ
     */
    function hardDrop() {
        if (!gameState.currentPiece || gameState.gameOver || gameState.paused) return;

        const piece = gameState.currentPiece;
        let dropDistance = 0;
        
        while (isValidPosition(piece.x, piece.y + 1, piece.rotation)) {
            piece.y++;
            dropDistance++;
        }

        gameState.score += dropDistance * SCORES.HARD_DROP;
        gameState.canHold = false;
        lockPiece();
        playSound('hardDrop');
    }

    /**
     * ホールド処理
     */
    function holdCurrentPiece() {
        if (!gameState.currentPiece || !gameState.canHold || gameState.gameOver || gameState.paused) return;

        const currentType = gameState.currentPiece.type;
        
        if (gameState.holdPiece) {
            // ホールドピースと交換
            const x = Math.floor(COLS / 2) - 2;
            const y = -SPAWN_ROW;
            
            gameState.currentPiece = {
                type: gameState.holdPiece,
                x: x,
                y: y,
                rotation: 0
            };
        } else {
            // 新しいピース生成
            spawnPiece();
        }

        gameState.holdPiece = currentType;
        gameState.canHold = false;
        gameState.lockTimer = 0;
        gameState.lockResets = 0;
        gameState.isLocked = false;
        
        playSound('hold');
    }

    /**
     * ピースロック
     */
    function lockPiece() {
        const piece = gameState.currentPiece;
        const matrix = getRotatedMatrix(piece.type, piece.rotation);
        
        // ▼追加：天井はみ出し（トップアウト）検出用
        let topOut = false;
        
        // ボードに配置
        for (let py = 0; py < matrix.length; py++) {
            for (let px = 0; px < matrix[py].length; px++) {
                if (matrix[py][px]) {
                    const nx = piece.x + px;
                    const ny = piece.y + py;
                    if (ny < 0) {
                        topOut = true; // 画面上端より上に残ってロック
                        continue;
                    }
                    gameState.board[ny * COLS + nx] = getColorIndex(piece.type);
                }
            }
        }

        // ▼追加：トップアウトなら即ゲームオーバー
        if (topOut) {
            gameState.gameOver = true;
            saveHighScore();
            showGameOverOverlay();
            playSound('gameOver');
            return;
        }

        // T-Spin判定
        const isTSpin = checkTSpin(piece);
        
        // ライン消去
        const linesCleared = clearLines();
        
        // スコア計算
        if (linesCleared > 0) {
            calculateScore(linesCleared, isTSpin);
            gameState.lines += linesCleared;
            gameState.level = Math.floor(gameState.lines / 10) + 1;
            playSound('lineClear');
        } else {
            gameState.combo = -1;
        }

        // 新しいピース生成
        spawnPiece();
        playSound('lock');
    }
    /**
     * T-Spin判定（3-corner法）
     */
    function checkTSpin(piece) {
        if (piece.type !== 'T') return { isTSpin: false, isMini: false };

        const corners = [
            [piece.x, piece.y],
            [piece.x + 2, piece.y],
            [piece.x, piece.y + 2],
            [piece.x + 2, piece.y + 2]
        ];

        let filledCorners = 0;
        for (let [x, y] of corners) {
            if (x < 0 || x >= COLS || y >= ROWS || 
                (y >= 0 && gameState.board[y * COLS + x])) {
                filledCorners++;
            }
        }

        const isTSpin = filledCorners >= 3;
        
        // Mini判定は簡易版
        let isMini = false;
        if (isTSpin) {
            const frontCorners = piece.rotation === 0 ? [corners[2], corners[3]] :
                               piece.rotation === 1 ? [corners[0], corners[2]] :
                               piece.rotation === 2 ? [corners[0], corners[1]] :
                               [corners[1], corners[3]];
            
            let frontFilled = 0;
            for (let [x, y] of frontCorners) {
                if (x < 0 || x >= COLS || y >= ROWS || 
                    (y >= 0 && gameState.board[y * COLS + x])) {
                    frontFilled++;
                }
            }
            isMini = frontFilled !== 2;
        }

        return { isTSpin, isMini };
    }

    /**
     * ライン消去
     */
    function clearLines() {
        const linesToClear = [];
        
        for (let y = 0; y < ROWS; y++) {
            let full = true;
            for (let x = 0; x < COLS; x++) {
                if (!gameState.board[y * COLS + x]) {
                    full = false;
                    break;
                }
            }
            if (full) {
                linesToClear.push(y);
            }
        }

        if (linesToClear.length === 0) return 0;

        // ライン消去アニメーション（簡易版）
        setTimeout(() => {
            // 上のラインを下に移動
            for (let clearY of linesToClear.reverse()) {
                for (let y = clearY; y > 0; y--) {
                    for (let x = 0; x < COLS; x++) {
                        gameState.board[y * COLS + x] = gameState.board[(y-1) * COLS + x];
                    }
                }
                // 最上段をクリア
                for (let x = 0; x < COLS; x++) {
                    gameState.board[x] = 0;
                }
            }
        }, 150);

        return linesToClear.length;
    }

    /**
     * スコア計算
     */
    function calculateScore(linesCleared, tSpinInfo) {
        let baseScore = 0;
        let isSpecial = false;

        if (tSpinInfo.isTSpin) {
            if (tSpinInfo.isMini) {
                baseScore = linesCleared === 1 ? SCORES.TSPIN_MINI : SCORES.TSPIN_MINI_DOUBLE;
            } else {
                baseScore = linesCleared === 1 ? SCORES.TSPIN_SINGLE :
                           linesCleared === 2 ? SCORES.TSPIN_DOUBLE :
                           SCORES.TSPIN_TRIPLE;
            }
            isSpecial = true;
        } else {
            baseScore = linesCleared === 1 ? SCORES.SINGLE :
                       linesCleared === 2 ? SCORES.DOUBLE :
                       linesCleared === 3 ? SCORES.TRIPLE :
                       SCORES.TETRIS;
            isSpecial = linesCleared === 4;
        }

        // Back-to-Back判定
        if (isSpecial && gameState.lastWasSpecial) {
            baseScore = Math.floor(baseScore * SCORES.B2B_MULTIPLIER);
            gameState.b2b = true;
        } else {
            gameState.b2b = false;
        }

        gameState.lastWasSpecial = isSpecial;

        // コンボ
        gameState.combo++;
        const comboBonus = gameState.combo > 0 ? SCORES.COMBO_BONUS * gameState.combo : 0;

        // レベルボーナス
        const levelMultiplier = gameState.level;
        
        gameState.score += (baseScore + comboBonus) * levelMultiplier;

        if (gameState.score > gameState.highScore) {
            gameState.highScore = gameState.score;
        }
    }

    /**
     * 色インデックス取得
     */
    function getColorIndex(pieceType) {
        return PIECE_TYPES.indexOf(pieceType) + 1;
    }

    /**
     * ゲームループ
     */
    function gameLoop(currentTime) {
        const dt = currentTime - lastTime;
        lastTime = currentTime;

        update(dt);
        render();

        animationId = requestAnimationFrame(gameLoop);
    }

    /**
     * ゲーム更新
     */
    function update(dt) {
        if (gameState.gameOver || gameState.paused) return;

        updateInput(dt);
        updateGravity(dt);
        updateLockTimer(dt);
    }

    /**
     * 入力更新
     */
    function updateInput(dt) {
        // 左右移動DAS/ARR
        if (input.leftPressed) {
            input.leftTime += dt;
            if (input.leftTime >= DAS_DELAY) {
                if (input.leftTime - DAS_DELAY >= ARR_DELAY) {
                    movePiece(-1);
                    input.leftTime = DAS_DELAY;
                }
            }
        }

        if (input.rightPressed) {
            input.rightTime += dt;
            if (input.rightTime >= DAS_DELAY) {
                if (input.rightTime - DAS_DELAY >= ARR_DELAY) {
                    movePiece(1);
                    input.rightTime = DAS_DELAY;
                }
            }
        }

        // ソフトドロップ
        if (input.downPressed) {
            input.downTime += dt;
            if (input.downTime >= ARR_DELAY) {
                if (softDropPiece()) {
                    gameState.score += SCORES.SOFT_DROP;
                }
                input.downTime = 0;
            }
        }
    }

    /**
     * 重力更新
     */
    function updateGravity(dt) {
        if (!gameState.currentPiece) return;

        const dropSpeed = input.downPressed ? 
            LEVEL_SPEEDS[Math.min(gameState.level - 1, LEVEL_SPEEDS.length - 1)] / SOFT_DROP_MULTIPLIER :
            LEVEL_SPEEDS[Math.min(gameState.level - 1, LEVEL_SPEEDS.length - 1)];

        gameState.dropTimer += dt;
        
        if (gameState.dropTimer >= dropSpeed) {
            if (!softDropPiece()) {
                // 接地
                if (!gameState.isLocked) {
                    gameState.isLocked = true;
                    gameState.lockTimer = 0;
                }
            }
            gameState.dropTimer = 0;
        }
    }

    /**
     * ロックタイマー更新
     */
    function updateLockTimer(dt) {
        if (!gameState.isLocked) return;

        gameState.lockTimer += dt;
        if (gameState.lockTimer >= LOCK_DELAY) {
            lockPiece();
        }
    }

    /**
     * ソフトドロップ
     */
    function softDropPiece() {
        if (!gameState.currentPiece) return false;

        const newY = gameState.currentPiece.y + 1;
        if (isValidPosition(gameState.currentPiece.x, newY, gameState.currentPiece.rotation)) {
            gameState.currentPiece.y = newY;
            return true;
        }
        return false;
    }

    /**
     * ゴースト位置計算
     */
    function getGhostPosition() {
        if (!gameState.currentPiece) return null;

        const piece = gameState.currentPiece;
        let ghostY = piece.y;
        
        while (isValidPosition(piece.x, ghostY + 1, piece.rotation)) {
            ghostY++;
        }
        
        return { x: piece.x, y: ghostY, rotation: piece.rotation };
    }

    /**
     * 描画
     */
    function render() {
        renderGame();
        renderHold();
        renderNext();
        updateUI();
    }

    /**
     * メインゲーム描画
     */
    function renderGame() {
        const ctx = gameCtx;
        const canvasWidth = gameCanvas.clientWidth;
        const canvasHeight = gameCanvas.clientHeight;
        const cellSize = canvasWidth / COLS;
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // ボード描画
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const cellValue = gameState.board[y * COLS + x];
                if (cellValue) {
                    drawCell(ctx, x, y, getPieceColor(cellValue), cellSize);
                }
            }
        }

        // ゴースト描画
        const ghost = getGhostPosition();
        if (ghost && gameState.currentPiece) {
            const matrix = getRotatedMatrix(gameState.currentPiece.type, ghost.rotation);
            ctx.globalAlpha = 0.3;
            for (let py = 0; py < matrix.length; py++) {
                for (let px = 0; px < matrix[py].length; px++) {
                    if (matrix[py][px]) {
                        const x = ghost.x + px;
                        const y = ghost.y + py;
                        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
                            drawCellOutline(ctx, x, y, TETROMINOS[gameState.currentPiece.type].color, cellSize);
                        }
                    }
                }
            }
            ctx.globalAlpha = 1;
        }

        // 現在のピース描画
        if (gameState.currentPiece) {
            const piece = gameState.currentPiece;
            const matrix = getRotatedMatrix(piece.type, piece.rotation);
            
            for (let py = 0; py < matrix.length; py++) {
                for (let px = 0; px < matrix[py].length; px++) {
                    if (matrix[py][px]) {
                        const x = piece.x + px;
                        const y = piece.y + py;
                        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
                            drawCell(ctx, x, y, TETROMINOS[piece.type].color, cellSize);
                        }
                    }
                }
            }
        }

        // グリッド描画
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let x = 0; x <= COLS; x++) {
            ctx.beginPath();
            ctx.moveTo(x * cellSize, 0);
            ctx.lineTo(x * cellSize, canvasHeight);
            ctx.stroke();
        }
        for (let y = 0; y <= ROWS; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * cellSize);
            ctx.lineTo(canvasWidth, y * cellSize);
            ctx.stroke();
        }
    }

    /**
     * セル描画
     */
    function drawCell(ctx, x, y, color, cellSize) {
        ctx.fillStyle = color;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }

    /**
     * セルアウトライン描画
     */
    function drawCellOutline(ctx, x, y, color, cellSize) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    }

    /**
     * ピース色取得
     */
    function getPieceColor(colorIndex) {
        return TETROMINOS[PIECE_TYPES[colorIndex - 1]].color;
    }

    /**
     * ホールド描画
     */
    function renderHold() {
        const ctx = holdCtx;
        const canvasWidth = holdCanvas.clientWidth;
        const canvasHeight = holdCanvas.clientHeight;
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        if (gameState.holdPiece) {
            const matrix = TETROMINOS[gameState.holdPiece].matrix;
            const color = gameState.canHold ? TETROMINOS[gameState.holdPiece].color : '#666';
            const cellSize = Math.min(canvasWidth / 4, canvasHeight / 4);
            const offsetX = (canvasWidth - matrix[0].length * cellSize) / 2;
            const offsetY = (canvasHeight - matrix.length * cellSize) / 2;

            for (let y = 0; y < matrix.length; y++) {
                for (let x = 0; x < matrix[y].length; x++) {
                    if (matrix[y][x]) {
                        ctx.fillStyle = color;
                        ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
                        ctx.strokeStyle = '#000';
                        ctx.strokeRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
                    }
                }
            }
        }
    }

    /**
     * ネクスト描画
     */
    function renderNext() {
        const ctx = nextCtx;
        const canvasWidth = nextCanvas.clientWidth;
        const canvasHeight = nextCanvas.clientHeight;
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        const cellSize = Math.min(canvasWidth / 4, 20);
        let currentY = 10;

        for (let i = 0; i < Math.min(gameState.nextPieces.length, 5); i++) {
            const pieceType = gameState.nextPieces[i];
            const matrix = TETROMINOS[pieceType].matrix;
            const color = TETROMINOS[pieceType].color;
            const offsetX = (canvasWidth - matrix[0].length * cellSize) / 2;

            for (let y = 0; y < matrix.length; y++) {
                for (let x = 0; x < matrix[y].length; x++) {
                    if (matrix[y][x]) {
                        ctx.fillStyle = color;
                        ctx.fillRect(offsetX + x * cellSize, currentY + y * cellSize, cellSize, cellSize);
                        ctx.strokeStyle = '#000';
                        ctx.strokeRect(offsetX + x * cellSize, currentY + y * cellSize, cellSize, cellSize);
                    }
                }
            }

            currentY += matrix.length * cellSize + 20;
        }
    }

    /**
     * UI更新
     */
    function updateUI() {
        document.getElementById('score').textContent = gameState.score.toLocaleString();
        document.getElementById('highScore').textContent = gameState.highScore.toLocaleString();
        document.getElementById('level').textContent = gameState.level;
        document.getElementById('lines').textContent = gameState.lines;

        const b2bArea = document.getElementById('b2bArea');
        b2bArea.style.display = gameState.b2b ? 'flex' : 'none';

        const comboArea = document.getElementById('comboArea');
        if (gameState.combo > 0) {
            comboArea.style.display = 'flex';
            document.getElementById('combo').textContent = gameState.combo;
        } else {
            comboArea.style.display = 'none';
        }
    }

    /**
     * ポーズ切り替え
     */
    function togglePause() {
        if (gameState.gameOver) return;
        
        gameState.paused = !gameState.paused;
        
        if (gameState.paused) {
            showPauseOverlay();
        } else {
            hidePauseOverlay();
        }
    }

    /**
     * オーバーレイ表示/非表示
     */
    function showPauseOverlay() {
        document.getElementById('pauseOverlay').style.display = 'flex';
    }

    function hidePauseOverlay() {
        document.getElementById('pauseOverlay').style.display = 'none';
    }

    function showGameOverOverlay() {
        document.getElementById('gameOverOverlay').style.display = 'flex';
    }

    function hideOverlays() {
        document.getElementById('pauseOverlay').style.display = 'none';
        document.getElementById('gameOverOverlay').style.display = 'none';
    }

    /**
     * ハイスコア保存/読み込み
     */
    function saveHighScore() {
        try {
            localStorage.setItem('tetrisHighScore', gameState.highScore.toString());
        } catch (e) {
            // localStorage使用不可の場合は無視
        }
    }

    function loadHighScore() {
        try {
            const saved = localStorage.getItem('tetrisHighScore');
            if (saved) {
                gameState.highScore = parseInt(saved, 10) || 0;
            }
        } catch (e) {
            // localStorage使用不可の場合は無視
        }
    }

    /**
     * サウンド再生
     */
    function playSound(type) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            let frequency = 440;
            let duration = 100;
            
            switch (type) {
                case 'lineClear':
                    frequency = 800;
                    duration = 200;
                    break;
                case 'lock':
                    frequency = 300;
                    duration = 50;
                    break;
                case 'hardDrop':
                    frequency = 600;
                    duration = 80;
                    break;
                case 'hold':
                    frequency = 500;
                    duration = 150;
                    break;
                case 'gameOver':
                    frequency = 200;
                    duration = 500;
                    break;
            }
            
            oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
            oscillator.type = 'square';
            
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration / 1000);
            
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + duration / 1000);
        } catch (e) {
            // サウンド再生エラーは無視
        }
    }

    // 初期化実行
    document.addEventListener('DOMContentLoaded', init);

    console.log("READY");

})();