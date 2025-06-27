/**
 * シリアル接続管理クラス
 * Web Serial APIを使用したシリアル通信の管理
 */
class SerialConnection {
    constructor(consoleManager) {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.consoleManager = consoleManager;
        
        // 製品情報
        this.deviceProductName = null;
        this.isWaitingForProductName = false;
        this.productNameBuffer = '';
        
        // 設定読み込み関連
        this.isWaitingForConfig = false;
        this.configBuffer = '';
        this.configReadResolve = null;
        
        // 他のクラスとの連携
        this.ulsaConfig = null;
        
        // UI要素の初期化
        this.initializeUIElements();
        this.attachEventListeners();
        this.checkWebSerialSupport();
    }

    initializeUIElements() {
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.sendBtn = document.getElementById('sendBtn');
        this.sendInput = document.getElementById('sendInput');
        
        // 接続設定要素
        this.baudRateSelect = document.getElementById('baudRate');
        
        // ステータス表示
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusIndicator = this.connectionStatus.querySelector('.status-indicator');
        this.statusText = this.connectionStatus.querySelector('.status-text');
    }

    attachEventListeners() {
        // 接続・切断ボタン
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        
        // データ送信
        this.sendBtn.addEventListener('click', () => this.sendData(false));
        this.sendInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Shift+Enter: CRつき送信, Enter: 改行なし送信
                this.sendData(e.shiftKey);
            }
        });

        // ページ終了時の処理
        window.addEventListener('beforeunload', () => this.disconnect());
    }

    /**
     * Web Serial APIサポート確認
     */
    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.consoleManager.logToConsole('error', 'Web Serial APIはこのブラウザでサポートされていません。');
            this.consoleManager.logToConsole('info', 'Chrome、Edge、またはOperaの最新版をご利用ください。');
            this.connectBtn.disabled = true;
        }
    }

    /**
     * シリアルポートに接続
     */
    async connect() {
        try {
            this.setConnecting(true);
            
            // 既存の接続がある場合は切断
            if (this.isConnected) {
                await this.disconnect();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // シリアルポートの選択
            this.port = await navigator.serial.requestPort();
            
            // 接続設定
            const options = {
                baudRate: parseInt(this.baudRateSelect.value),
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            };

            // ポートを開く
            try {
                await this.port.open(options);
            } catch (openError) {
                if (openError.name === 'InvalidStateError') {
                    this.consoleManager.logToConsole('info', 'ポートは既に開いています。再接続を試行します。');
                    await this.port.close();
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await this.port.open(options);
                } else {
                    throw openError;
                }
            }
            
            this.consoleManager.logToConsole('info', `シリアルポートに接続しました (${options.baudRate} baud)`);
            
            // Reader/Writerの設定
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.updateButtonStates();
            
            // データ受信の開始
            this.startReading();
            
            // ULSA設定を無効化状態で開始
            this.disableConfigurationControls();
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `接続エラー: ${error.message}`);
            this.updateConnectionStatus(false);
            this.port = null;
            if (error.name === 'NotFoundError') {
                this.consoleManager.logToConsole('info', 'ポートが選択されませんでした。');
            }
        } finally {
            this.setConnecting(false);
        }
    }

    /**
     * シリアルポートから切断
     */
    async disconnect() {
        try {
            this.isConnected = false;
            
            // Reader/Writerの解放
            if (this.reader) {
                try {
                    await this.reader.cancel();
                    await this.reader.releaseLock();
                } catch (e) {
                    // エラーは無視
                }
                this.reader = null;
            }
            
            if (this.writer) {
                try {
                    await this.writer.releaseLock();
                } catch (e) {
                    // エラーは無視
                }
                this.writer = null;
            }

            // ポートを閉じる
            if (this.port) {
                try {
                    await this.port.close();
                } catch (e) {
                    this.consoleManager.logToConsole('error', `ポートクローズエラー: ${e.message}`);
                }
                this.port = null;
            }

            this.updateConnectionStatus(false);
            this.updateButtonStates();
            this.consoleManager.resetReceiveBuffer();
            
            // 製品名情報をリセット
            this.deviceProductName = null;
            this.isWaitingForProductName = false;
            this.productNameBuffer = '';
            
            // M5B設定を初期状態に戻す
            this.resetM5bSettings();
            
            // ULSA設定を初期状態に戻す
            this.enableConfigurationControls();
            
            this.consoleManager.logToConsole('info', 'シリアルポートから切断しました');
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `切断エラー: ${error.message}`);
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.updateButtonStates();
        }
    }

    /**
     * データ受信ループ
     */
    async startReading() {
        const decoder = new TextDecoder();
        
        try {
            while (this.isConnected && this.reader) {
                const { value, done } = await this.reader.read();
                
                if (done) {
                    this.consoleManager.logToConsole('info', '読み取りストリームが終了しました');
                    break;
                }
                
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    
                    // 設定データ取得中の処理
                    if (this.isWaitingForConfig) {
                        this.configBuffer += chunk;
                        
                        // Configuration Listの開始と終了を検出
                        if (this.configBuffer.includes('============================== Configuration List ===================================') && 
                            this.configBuffer.includes('|[N]|')) {
                            
                            // N行（最後の設定行）が検出されたら、少し待ってから処理を開始
                            setTimeout(() => {
                                if (this.isWaitingForConfig) {
                                    this.isWaitingForConfig = false;
                                    const success = this.parseAndApplyConfiguration(this.configBuffer);
                                    
                                    if (this.configReadResolve) {
                                        this.configReadResolve(success);
                                        this.configReadResolve = null;
                                    }
                                    
                                    if (success) {
                                        this.enableConfigurationControls();
                                        
                                        // 製品名に応じたM5B設定制御も再実行
                                        if (this.deviceProductName) {
                                            this.optimizeSettingsForProduct(this.deviceProductName);
                                        }
                                        
                                        // ULSAConfigクラスに設定読み込み完了を通知
                                        if (this.ulsaConfig) {
                                            this.ulsaConfig.onConfigurationLoaded();
                                        }
                                    }
                                }
                            }, 500); // 500ms待ってから処理
                        }
                    }
                    
                    // 製品名検出の処理
                    if (this.isWaitingForProductName) {
                        this.processProductNameDetection(chunk);
                    }
                    
                    // 文字単位で処理して改行まで蓄積
                    for (let i = 0; i < chunk.length; i++) {
                        const char = chunk[i];
                        
                        if (char === '\n' || char === '\r') {
                            this.consoleManager.handleLineBreak();
                        } else {
                            this.consoleManager.addToCurrentReceiveLine(char);
                        }
                    }
                }
            }
        } catch (error) {
            if (this.isConnected && error.name !== 'NetworkError') {
                this.consoleManager.logToConsole('error', `読み取りエラー: ${error.message}`);
                this.disconnect();
            }
        }
    }

    /**
     * データ送信
     * @param {boolean} addCR - CRを追加するかどうか（Shift+Enterの場合true）
     */
    async sendData(addCR = false) {
        if (!this.isConnected || !this.writer) {
            this.consoleManager.logToConsole('error', 'シリアルポートが接続されていません');
            return;
        }

        const input = this.sendInput.value;
        if (!input.trim()) {
            return;
        }

        try {
            let dataToSend = input;
            
            // CRの追加（Shift+Enterの場合のみ）
            if (addCR) {
                dataToSend += '\r';
            }

            const data = new TextEncoder().encode(dataToSend);
            await this.writer.write(data);
            
            // 送信内容のログ表示
            let logMessage = input;
            if (addCR) {
                logMessage += ' [+CR]';
            } else {
                logMessage += ' [プレーンASCII]';
            }
            
            // バイト配列も表示
            const bytesDisplay = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
            this.consoleManager.logToConsole('sent', `${logMessage} (バイト: ${bytesDisplay})`);
            this.sendInput.value = '';
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `送信エラー: ${error.message}`);
        }
    }

    /**
     * 初期化コマンドのスケジュール
     */
    scheduleInitializationCommands() {
        this.consoleManager.logToConsole('info', '初期化コマンドを2秒後に送信します...');
        
        setTimeout(async () => {
            if (this.isConnected && this.writer) {
                await this.sendInitializationCommands();
            } else {
                this.consoleManager.logToConsole('warning', '初期化コマンド送信をスキップしました（未接続）');
            }
        }, 2000);
    }

    /**
     * 初期化コマンドの送信
     */
    async sendInitializationCommands() {
        try {
            this.consoleManager.logToConsole('info', '初期化コマンドを送信中...');
            
            // 1. "/" を送信
            await this.sendRawCommand('/');
            this.consoleManager.logToConsole('sent', '/ [初期化コマンド1]');
            
            // 2. 500ms 待機
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 3. "config\r" を送信
            this.isWaitingForProductName = true;
            this.productNameBuffer = '';
            await this.sendRawCommand('config\r');
            this.consoleManager.logToConsole('sent', 'config\\r [初期化コマンド2]');
            this.consoleManager.logToConsole('info', '製品名の検出を開始しました...');
            
            this.consoleManager.logToConsole('success', '初期化コマンドの送信が完了しました');
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `初期化コマンド送信エラー: ${error.message}`);
        }
    }

    /**
     * 生のコマンドを送信（ログ出力なし）
     * @param {string} command - 送信するコマンド
     */
    async sendRawCommand(command) {
        if (!this.isConnected || !this.writer) {
            throw new Error('シリアルポートが接続されていません');
        }

        const data = new TextEncoder().encode(command);
        await this.writer.write(data);
    }

    /**
     * 製品名検出処理
     * @param {string} chunk - 受信したデータチャンク
     */
    processProductNameDetection(chunk) {
        // 受信データをバッファに追加
        this.productNameBuffer += chunk;
        
        // 製品名パターンをチェック: [ULSA ...]
        const productNameMatch = this.productNameBuffer.match(/\[ULSA[^\]]*\]/);
        
        if (productNameMatch) {
            const productName = productNameMatch[0];
            this.deviceProductName = productName;
            this.isWaitingForProductName = false;
            
            this.consoleManager.logToConsole('success', `製品名を検出しました: ${productName}`);
            
            // 製品名に応じた処理
            this.handleProductNameDetected(productName);
            
            // バッファをクリア
            this.productNameBuffer = '';
        }
        
        // バッファが大きくなりすぎた場合はクリア（1000文字制限）
        if (this.productNameBuffer.length > 1000) {
            this.consoleManager.logToConsole('warning', '製品名検出タイムアウト - バッファをクリアしました');
            this.isWaitingForProductName = false;
            this.productNameBuffer = '';
        }
    }

    /**
     * 製品名検出後の処理
     * @param {string} productName - 検出された製品名
     */
    handleProductNameDetected(productName) {
        // 製品名を画面に表示
        this.displayProductName(productName);
        
        // 製品名に応じた設定の最適化
        this.optimizeSettingsForProduct(productName);
    }

    /**
     * 製品名を画面に表示
     * @param {string} productName - 表示する製品名
     */
    displayProductName(productName) {
        // ヘッダーの接続状態に製品名を追加
        const statusText = this.statusText;
        if (statusText) {
            statusText.textContent = `接続中 - ${productName}`;
        }
        
        // コンソールにも製品情報をログ
        this.consoleManager.logToConsole('info', `接続デバイス: ${productName}`);
    }

    /**
     * 製品に応じた設定の最適化
     * @param {string} productName - 製品名
     */
    optimizeSettingsForProduct(productName) {
        // 製品名から製品タイプを判定
        let productType = 'UNKNOWN';
        
        if (productName.includes('M5B')) {
            productType = 'ULSA_M5B';
        } else if (productName.includes('BASIC')) {
            productType = 'ULSA_BASIC';
        } else if (productName.includes('PRO') && productName.includes('UAB')) {
            productType = 'ULSA_PRO_UAB';
        }
        
        this.consoleManager.logToConsole('info', `製品タイプ: ${productType}`);
        
        // 製品タイプに応じた設定の最適化
        switch (productType) {
            case 'ULSA_M5B':
                this.consoleManager.logToConsole('info', 'ULSA M5B用設定を適用');
                this.enableM5bSettings(true);
                break;
            case 'ULSA_BASIC':
                this.consoleManager.logToConsole('info', 'ULSA BASIC用設定を適用 - M5B設定を無効化');
                this.enableM5bSettings(false);
                break;
            case 'ULSA_PRO_UAB':
                this.consoleManager.logToConsole('info', 'ULSA PRO(UAB)用設定を適用 - M5B設定を無効化');
                this.enableM5bSettings(false);
                break;
            default:
                this.consoleManager.logToConsole('info', 'デフォルト設定を適用');
                this.enableM5bSettings(true);
        }
    }

    /**
     * M5B設定の有効/無効制御
     * @param {boolean} enabled - M5B設定を有効にするかどうか
     */
    enableM5bSettings(enabled) {
        const m5bGroup = document.getElementById('m5bConfigGroup');
        const m5bCheckboxes = [
            'enableM5bProtocol',
            'enableM5bBaudrate', 
            'enableM5bOutputRate'
        ];
        const m5bSelects = [
            'm5bProtocol',
            'm5bBaudrate',
            'm5bOutputRate'
        ];

        if (!m5bGroup) {
            this.consoleManager.logToConsole('warning', 'M5B設定グループが見つかりません');
            return;
        }

        if (enabled) {
            // M5B設定を有効化
            m5bGroup.style.display = 'block';
            m5bGroup.style.opacity = '1';
            
            // チェックボックスを有効化
            m5bCheckboxes.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.disabled = false;
                }
            });
            
            this.consoleManager.logToConsole('info', 'M5Bポート設定が有効になりました');
            
        } else {
            // M5B設定を無効化
            m5bGroup.style.opacity = '0.5';
            m5bGroup.style.pointerEvents = 'none';
            
            // チェックボックスをOFFにして無効化
            m5bCheckboxes.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.checked = false;
                    element.disabled = true;
                }
            });
            
            // セレクトボックスも無効化
            m5bSelects.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.disabled = true;
                }
            });
            
            this.consoleManager.logToConsole('info', 'M5Bポート設定が無効になりました（この製品では利用できません）');
            
            // 無効化の理由を表示
            if (!document.getElementById('m5bDisabledNotice')) {
                const notice = document.createElement('div');
                notice.id = 'm5bDisabledNotice';
                notice.className = 'config-notice';
                notice.innerHTML = `
                    <i class="fas fa-info-circle"></i>
                    <span>この製品ではM5Bポートは利用できません</span>
                `;
                m5bGroup.appendChild(notice);
            }
        }
    }

    /**
     * M5B設定を初期状態にリセット
     */
    resetM5bSettings() {
        const m5bGroup = document.getElementById('m5bConfigGroup');
        const disabledNotice = document.getElementById('m5bDisabledNotice');
        
        if (m5bGroup) {
            // 表示状態を初期化
            m5bGroup.style.display = 'block';
            m5bGroup.style.opacity = '1';
            m5bGroup.style.pointerEvents = 'auto';
            
            // 無効化通知を削除
            if (disabledNotice) {
                disabledNotice.remove();
            }
            
            // チェックボックスを有効化（値はそのまま）
            const m5bCheckboxes = [
                'enableM5bProtocol',
                'enableM5bBaudrate', 
                'enableM5bOutputRate'
            ];
            
            m5bCheckboxes.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.disabled = false;
                }
            });
            
            this.consoleManager.logToConsole('info', 'M5B設定を初期状態にリセットしました');
        }
    }

    /**
     * ULSA設定コントロールを無効化
     */
    disableConfigurationControls() {
        // すべてのULSA設定項目を無効化
        const configElements = [
            // ノードID設定
            'enableNodeId',
            'nodeId',
            
            // USBポート設定
            'enableUsbProtocol',
            'usbProtocol',
            'enableUsbBaudrate',
            'usbBaudrate',
            'enableUsbOutputRate',
            'usbOutputRate',
            
            // AUXポート設定
            'enableAuxProtocol',
            'auxProtocol',
            'enableAuxBaudrate',
            'auxBaudrate',
            'enableAuxOutputRate',
            'auxOutputRate',
            
            // M5Bポート設定
            'enableM5bProtocol',
            'm5bProtocol',
            'enableM5bBaudrate',
            'm5bBaudrate',
            'enableM5bOutputRate',
            'm5bOutputRate',
            
            // 平均化サイクル設定
            'enableAveragingCycle',
            'averagingCycle'
        ];

        configElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = true;
                // チェックボックスの場合は未チェック状態にする
                if (element.type === 'checkbox') {
                    element.checked = false;
                }
            }
        });

        // 設定送信ボタンも無効化
        const sendConfigBtn = document.getElementById('sendConfigBtn');
        if (sendConfigBtn) {
            sendConfigBtn.disabled = true;
        }

        // 設定エリア全体を視覚的に無効化し、オーバーレイを表示
        const configSection = document.querySelector('.config-section');
        const configOverlay = document.getElementById('configOverlay');
        if (configSection && configOverlay) {
            configSection.classList.add('disabled');
            configOverlay.style.display = 'flex';
            configOverlay.style.pointerEvents = 'auto';
            configOverlay.style.zIndex = '1000';
            // CSSの初期状態と同じ背景色に統一
            configOverlay.style.background = 'rgba(255, 255, 255, 0.5)';
            configOverlay.style.backdropFilter = 'blur(0.5px)';
            
            // ボタンにもクリック可能にする
            const overlayBtn = document.getElementById('overlayReadConfigBtn');
            if (overlayBtn) {
                overlayBtn.style.pointerEvents = 'auto';
                overlayBtn.style.cursor = 'pointer';
                this.consoleManager.logToConsole('info', 'オーバーレイボタンを有効化しました');
            }
            
            this.consoleManager.logToConsole('info', 'オーバーレイを表示しました');
        } else {
            this.consoleManager.logToConsole('warning', 'configSectionまたはconfigOverlayが見つかりません');
        }

        this.consoleManager.logToConsole('info', 'ULSA設定項目を無効化しました - 「設定を読み込み」を実行してください');
    }

    /**
     * ULSA設定コントロールを有効化
     */
    enableConfigurationControls() {
        // 設定エリア全体を有効化し、オーバーレイを非表示
        const configSection = document.querySelector('.config-section');
        const configOverlay = document.getElementById('configOverlay');
        if (configSection && configOverlay) {
            configSection.classList.remove('disabled');
            configOverlay.style.display = 'none';
            this.consoleManager.logToConsole('info', 'オーバーレイを非表示にしました');
        }

        // すべてのULSA設定項目を有効化
        const configElements = [
            // ノードID設定
            'enableNodeId',
            
            // USBポート設定
            'enableUsbProtocol',
            'enableUsbBaudrate',
            'enableUsbOutputRate',
            
            // AUXポート設定
            'enableAuxProtocol',
            'enableAuxBaudrate',
            'enableAuxOutputRate',
            
            // M5Bポート設定（製品に応じて制御される）
            'enableM5bProtocol',
            'enableM5bBaudrate',
            'enableM5bOutputRate',
            
            // 平均化サイクル設定
            'enableAveragingCycle'
        ];

        configElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
            }
        });

        // セレクトボックスも有効化
        const selectElements = [
            'nodeId',
            'usbProtocol',
            'usbBaudrate',
            'usbOutputRate',
            'auxProtocol',
            'auxBaudrate',
            'auxOutputRate',
            'm5bProtocol',
            'm5bBaudrate',
            'm5bOutputRate',
            'averagingCycle'
        ];

        selectElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                // 対応するチェックボックスがチェックされている場合のみ有効化
                const checkboxId = 'enable' + id.charAt(0).toUpperCase() + id.slice(1);
                const checkbox = document.getElementById(checkboxId);
                element.disabled = !(checkbox && checkbox.checked);
            }
        });

        // 設定送信ボタンを有効化
        const sendConfigBtn = document.getElementById('sendConfigBtn');
        if (sendConfigBtn) {
            sendConfigBtn.disabled = false;
        }

        this.consoleManager.logToConsole('success', 'ULSA設定項目が有効になりました');
    }

    /**
     * 設定読み込み処理（初期化コマンド送信）
     */
    async performConfigurationRead() {
        if (!this.isConnected || !this.writer) {
            this.consoleManager.logToConsole('error', 'シリアルポートが接続されていません');
            return false;
        }

        try {
            this.consoleManager.logToConsole('info', '設定を読み込み中...');
            
            // 設定取得フラグを設定
            this.isWaitingForConfig = true;
            this.configBuffer = '';
            
            // 初期化コマンドを送信（元の自動送信ロジック）
            await this.sendInitializationCommands();
            
            // 設定解析とUI反映の処理を待つ
            return new Promise((resolve) => {
                this.configReadResolve = resolve;
                
                // タイムアウト処理（10秒）
                setTimeout(() => {
                    if (this.isWaitingForConfig) {
                        this.isWaitingForConfig = false;
                        this.consoleManager.logToConsole('warning', '設定読み込みがタイムアウトしました');
                        resolve(false);
                    }
                }, 10000);
            });
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `設定読み込みエラー: ${error.message}`);
            return false;
        }
    }

    /**
     * 設定読み込み処理を開始
     */
    async loadConfiguration() {
        if (!this.isConnected || !this.writer) {
            this.consoleManager.logToConsole('error', 'シリアルポートが接続されていません');
            return false;
        }

        if (this.isWaitingForConfig) {
            this.consoleManager.logToConsole('warning', '既に設定読み込み処理中です');
            return false;
        }

        try {
            this.consoleManager.logToConsole('info', '設定読み込みを開始します...');
            
            // 設定読み込みの準備
            this.isWaitingForConfig = true;
            this.configBuffer = '';
            
            // 設定読み込みコマンドを送信
            await this.sendRawCommand('config\r');
            this.consoleManager.logToConsole('sent', 'config\\r [設定読み込みコマンド]');
            
            // 設定読み込み完了を待つPromiseを作成
            return new Promise((resolve) => {
                this.configReadResolve = resolve;
                
                // タイムアウト設定（10秒）
                setTimeout(() => {
                    if (this.isWaitingForConfig) {
                        this.isWaitingForConfig = false;
                        this.configBuffer = '';
                        if (this.configReadResolve) {
                            this.configReadResolve(false);
                            this.configReadResolve = null;
                        }
                        this.consoleManager.logToConsole('error', '設定読み込みがタイムアウトしました');
                    }
                }, 10000);
            });
            
        } catch (error) {
            this.isWaitingForConfig = false;
            this.configBuffer = '';
            this.consoleManager.logToConsole('error', `設定読み込みエラー: ${error.message}`);
            return false;
        }
    }

    /**
     * 受信した設定データを解析してUIに反映
     */
    parseAndApplyConfiguration(configText) {
        try {
            // this.consoleManager.logToConsole('info', '設定データを解析中...');
            
            // 受信した生データをログ出力
            // this.consoleManager.logToConsole('info', '=== 受信した設定データ（生データ） ===');
            const configLines = configText.split('\n');
            configLines.forEach((line, index) => {
                if (line.trim()) {
                    // this.consoleManager.logToConsole('info', `[${index}] ${line}`);
                }
            });
            // this.consoleManager.logToConsole('info', '=== 生データ終了 ===');
            
            // 設定行を解析
            const lines = configText.split('\n');
            const config = {};
            
            // this.consoleManager.logToConsole('info', '=== 解析結果 ===');
            
            for (const line of lines) {
                // |[A]| SET Sensor Node Number            |[0                  ]| 形式の行を解析
                const match = line.match(/\|\[([A-Z])\]\|\s*SET\s+(.+?)\s*\|\[(.+?)\]/);
                if (match) {
                    const key = match[1]; // A, B, C, E, G, H, I, N
                    const setting = match[2]; // 設定名
                    const value = match[3].trim(); // 設定値
                    
                    config[key] = {
                        name: setting,
                        value: value
                    };
                    
                    // 解析した各設定をログ出力
                    // this.consoleManager.logToConsole('info', `[${key}] ${setting} = "${value}"`);
                }
            }
            
            // this.consoleManager.logToConsole('info', '=== 解析結果終了 ===');
            
            // 解析した設定の詳細をログ出力
            this.logConfigurationDetails(config);
            
            // UIに設定値を反映
            this.applyConfigurationToUI(config);
            
            // this.consoleManager.logToConsole('success', '設定データをUIに反映しました');
            return true;
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `設定解析エラー: ${error.message}`);
            return false;
        }
    }

    /**
     * 解析した設定の詳細をログ出力
     */
    logConfigurationDetails(config) {
        // this.consoleManager.logToConsole('info', '=== 設定値の詳細分析 ===');
        
        // Node ID [A]
        if (config['A']) {
            // this.consoleManager.logToConsole('info', `ノードID: ${config['A'].value}`);
        }
        
        // USB設定 [B], [C], [E]
        if (config['B']) {
            const protocolValue = this.getProtocolValue(config['B'].value);
            // this.consoleManager.logToConsole('info', `USBプロトコル: "${config['B'].value}" → セレクト値: ${protocolValue}`);
        }
        
        if (config['C']) {
            const baudrateValue = this.getBaudrateValue(config['C'].value);
            // this.consoleManager.logToConsole('info', `USBボーレート: "${config['C'].value}" → セレクト値: ${baudrateValue}`);
        }
        
        if (config['E']) {
            const outputRateValue = this.getOutputRateValue(config['E'].value);
            // this.consoleManager.logToConsole('info', `USB出力レート: "${config['E'].value}" → セレクト値: ${outputRateValue}`);
        }
        
        // AUX設定 [G], [H], [I]
        if (config['G']) {
            const protocolValue = this.getProtocolValue(config['G'].value);
            // this.consoleManager.logToConsole('info', `AUXプロトコル: "${config['G'].value}" → セレクト値: ${protocolValue}`);
        }
        
        if (config['H']) {
            const baudrateValue = this.getBaudrateValue(config['H'].value);
            // this.consoleManager.logToConsole('info', `AUXボーレート: "${config['H'].value}" → セレクト値: ${baudrateValue}`);
        }
        
        if (config['I']) {
            const outputRateValue = this.getOutputRateValue(config['I'].value);
            // this.consoleManager.logToConsole('info', `AUX出力レート: "${config['I'].value}" → セレクト値: ${outputRateValue}`);
        }
        
        // 平均化サイクル [N]
        if (config['N']) {
            const averagingCycleValue = this.getAveragingCycleValue(config['N'].value);
            // this.consoleManager.logToConsole('info', `平均化サイクル: "${config['N'].value}" → セレクト値: ${averagingCycleValue}`);
        }
        
        // this.consoleManager.logToConsole('info', '=== 設定値分析終了 ===');
    }

    /**
     * 解析した設定値をUIに反映
     */
    applyConfigurationToUI(config) {
        // this.consoleManager.logToConsole('info', '=== UI反映開始 ===');
        
        // Node ID [A]
        if (config['A']) {
            const nodeIdInput = document.getElementById('nodeId');
            if (nodeIdInput) {
                nodeIdInput.value = config['A'].value;
                // this.consoleManager.logToConsole('success', `ノードID "${config['A'].value}" をUIに反映しました`);
            } else {
                this.consoleManager.logToConsole('warning', 'ノードID要素が見つかりません');
            }
        }

        // USB設定 [B], [C], [E]
        // this.consoleManager.logToConsole('info', 'USB設定を反映中...');
        this.applyPortConfigurationByKey(config, 'B', 'C', 'E', 'Usb');
        
        // AUX設定 [G], [H], [I]  
        // this.consoleManager.logToConsole('info', 'AUX設定を反映中...');
        this.applyPortConfigurationByKey(config, 'G', 'H', 'I', 'Aux');
        
        // 平均化サイクル [N]
        if (config['N']) {
            const averagingCycleSelect = document.getElementById('averagingCycle');
            if (averagingCycleSelect) {
                const averagingCycleValue = this.getAveragingCycleValue(config['N'].value);
                if (averagingCycleValue !== null) {
                    averagingCycleSelect.value = averagingCycleValue;
                    // this.consoleManager.logToConsole('success', 
                    //     `平均化サイクル: "${config['N'].value}" → 値"${averagingCycleValue}" に設定`);
                } else {
                    this.consoleManager.logToConsole('warning', 
                        `平均化サイクル値 "${config['N'].value}" の変換に失敗`);
                }
            } else {
                this.consoleManager.logToConsole('warning', '平均化サイクル要素が見つかりません');
            }
        }
        
        // this.consoleManager.logToConsole('info', '=== UI反映完了 ===');
    }

    /**
     * キー別ポート設定の適用
     */
    applyPortConfigurationByKey(config, protocolKey, baudrateKey, outputRateKey, portPrefix) {
        this.consoleManager.logToConsole('info', `${portPrefix}ポート設定を反映中... (キー: ${protocolKey}, ${baudrateKey}, ${outputRateKey})`);
        
        // プロトコル設定
        if (config[protocolKey]) {
            const protocolSelect = document.getElementById(`${portPrefix.toLowerCase()}Protocol`);
            if (protocolSelect) {
                const protocolValue = this.getProtocolValue(config[protocolKey].value);
                if (protocolValue !== null) {
                    protocolSelect.value = protocolValue;
                    // this.consoleManager.logToConsole('success', 
                    //     `${portPrefix}プロトコル: "${config[protocolKey].value}" → 値"${protocolValue}" に設定`);
                } else {
                    this.consoleManager.logToConsole('warning', 
                        `${portPrefix}プロトコル値 "${config[protocolKey].value}" の変換に失敗`);
                }
            } else {
                this.consoleManager.logToConsole('warning', 
                    `${portPrefix}プロトコル要素が見つかりません`);
            }
        }
        
        // ボーレート設定
        if (config[baudrateKey]) {
            const baudrateSelect = document.getElementById(`${portPrefix.toLowerCase()}Baudrate`);
            if (baudrateSelect) {
                const baudrateValue = this.getBaudrateValue(config[baudrateKey].value);
                if (baudrateValue !== null) {
                    baudrateSelect.value = baudrateValue;
                    // this.consoleManager.logToConsole('success', 
                    //     `${portPrefix}ボーレート: "${config[baudrateKey].value}" → 値"${baudrateValue}" に設定`);
                } else {
                    this.consoleManager.logToConsole('warning', 
                        `${portPrefix}ボーレート値 "${config[baudrateKey].value}" の変換に失敗`);
                }
            } else {
                this.consoleManager.logToConsole('warning', 
                    `${portPrefix}ボーレート要素が見つかりません`);
            }
        }
        
        // 出力レート設定
        if (config[outputRateKey]) {
            const outputRateSelect = document.getElementById(`${portPrefix.toLowerCase()}OutputRate`);
            if (outputRateSelect) {
                const outputRateValue = this.getOutputRateValue(config[outputRateKey].value);
                if (outputRateValue !== null) {
                    outputRateSelect.value = outputRateValue;
                    // this.consoleManager.logToConsole('success', 
                    //     `${portPrefix}出力レート: "${config[outputRateKey].value}" → 値"${outputRateValue}" に設定`);
                } else {
                    this.consoleManager.logToConsole('warning', 
                        `${portPrefix}出力レート値 "${config[outputRateKey].value}" の変換に失敗`);
                }
            } else {
                this.consoleManager.logToConsole('warning', 
                    `${portPrefix}出力レート要素が見つかりません`);
            }
        }
    }

    /**
     * プロトコル名から値を取得
     */
    getProtocolValue(protocolName) {
        const protocolMap = {
            'Nothing Output': '0',
            'Simple CSV': '1', 
            'List Format': '2',
            'NMEA0183': '3',
            'Graph Plot (e.g. CPLT)': '4'
        };
        
        // プロトコル名から数値部分を抽出
        const match = protocolName.match(/(\d+)\s*:\s*(.+)/);
        if (match) {
            const value = match[1];
            const name = match[2];
            // this.consoleManager.logToConsole('info', `プロトコル解析: "${protocolName}" → 数値:"${value}", 名前:"${name}"`);
            return value; // 数値部分を返す
        }
        
        // マッピングテーブルから検索
        const mappedValue = protocolMap[protocolName];
        if (mappedValue) {
            // this.consoleManager.logToConsole('info', `プロトコルマッピング: "${protocolName}" → "${mappedValue}"`);
            return mappedValue;
        }
        
        this.consoleManager.logToConsole('warning', `プロトコル値 "${protocolName}" の変換に失敗`);
        return null;
    }

    /**
     * ボーレート名から値を取得
     */
    getBaudrateValue(baudrateName) {
        const baudrateMap = {
            '4800bps': '0',
            '9600bps': '1',
            '19200bps': '2',
            '38400bps': '3',
            '57600bps': '4',
            '115200bps': '5'
        };
        
        // ボーレート名から数値部分を抽出
        const match = baudrateName.match(/(\d+)\s*:\s*(.+)/);
        if (match) {
            const value = match[1];
            const name = match[2];
            // this.consoleManager.logToConsole('info', `ボーレート解析: "${baudrateName}" → 数値:"${value}", 名前:"${name}"`);
            return value; // 数値部分を返す
        }
        
        // マッピングテーブルから検索
        const mappedValue = baudrateMap[baudrateName];
        if (mappedValue) {
            // this.consoleManager.logToConsole('info', `ボーレートマッピング: "${baudrateName}" → "${mappedValue}"`);
            return mappedValue;
        }
        
        this.consoleManager.logToConsole('warning', `ボーレート値 "${baudrateName}" の変換に失敗`);
        return null;
    }

    /**
     * 出力レート名から値を取得
     */
    getOutputRateValue(outputRateName) {
        const outputRateMap = {
            '1Hz': '0',
            '2Hz': '1', 
            '5Hz': '2',
            '10Hz': '3'
        };
        
        // 出力レート名から数値部分を抽出
        const match = outputRateName.match(/(\d+)\s*:\s*(.+)/);
        if (match) {
            const value = match[1];
            const name = match[2];
            // this.consoleManager.logToConsole('info', `出力レート解析: "${outputRateName}" → 数値:"${value}", 名前:"${name}"`);
            return value; // 数値部分を返す
        }
        
        // マッピングテーブルから検索
        const mappedValue = outputRateMap[outputRateName];
        if (mappedValue) {
            // this.consoleManager.logToConsole('info', `出力レートマッピング: "${outputRateName}" → "${mappedValue}"`);
            return mappedValue;
        }
        
        this.consoleManager.logToConsole('warning', `出力レート値 "${outputRateName}" の変換に失敗`);
        return null;
    }

    /**
     * 接続中状態の表示制御
     * @param {boolean} connecting - 接続中かどうか
     */
    setConnecting(connecting) {
        if (connecting) {
            this.connectBtn.innerHTML = '<div class="loading"></div> 接続中...';
            this.connectBtn.disabled = true;
            this.disconnectBtn.disabled = true;
        } else {
            this.connectBtn.innerHTML = '<i class="fas fa-plug"></i> 接続';
            this.updateButtonStates();
        }
    }

    /**
     * ボタン状態の更新
     */
    updateButtonStates() {
        this.connectBtn.disabled = this.isConnected;
        this.disconnectBtn.disabled = !this.isConnected;
        this.sendBtn.disabled = !this.isConnected;
        this.sendInput.disabled = !this.isConnected;
    }

    /**
     * 平均化サイクル値から選択値を取得
     */
    getAveragingCycleValue(averagingCycleName) {
        // 直接数値が来る場合（32 など）
        const directValue = parseInt(averagingCycleName.trim());
        if (!isNaN(directValue)) {
            const cycleMap = {
                1: '0',   // 1 measurement cycle
                4: '1',   // 4 measurement cycles  
                8: '2',   // 8 measurement cycles
                16: '3',  // 16 measurement cycles
                32: '4',  // 32 measurement cycles
                64: '5'   // 64 measurement cycles
            };
            
            const mappedValue = cycleMap[directValue];
            if (mappedValue) {
                // this.consoleManager.logToConsole('info', `平均化サイクル数値マッピング: "${directValue}" → "${mappedValue}"`);
                return mappedValue;
            }
        }
        
        // パターンマッチ（"4 : 32 measurement cycles" など）
        const match = averagingCycleName.match(/(\d+)\s*:\s*(\d+)\s*measurement\s*cycles?/);
        if (match) {
            const selectValue = match[1];
            const cycleCount = match[2];
            // this.consoleManager.logToConsole('info', `平均化サイクル解析: "${averagingCycleName}" → セレクト値:"${selectValue}", サイクル数:"${cycleCount}"`);
            return selectValue;
        }
        
        this.consoleManager.logToConsole('warning', `平均化サイクル値 "${averagingCycleName}" の変換に失敗`);
        return null;
    }

    /**
     * 接続状態表示の更新
     * @param {boolean} connected - 接続されているかどうか
     */
    updateConnectionStatus(connected) {
        if (connected) {
            this.statusIndicator.className = 'status-indicator connected';
            this.statusText.textContent = '接続中';
        } else {
            this.statusIndicator.className = 'status-indicator disconnected';
            this.statusText.textContent = '未接続';
        }
    }

    /**
     * 接続状態を取得
     */
    getConnectionState() {
        return {
            isConnected: this.isConnected,
            port: this.port,
            reader: this.reader,
            writer: this.writer,
            productName: this.deviceProductName
        };
    }

    /**
     * 検出された製品名を取得
     */
    getProductName() {
        return this.deviceProductName;
    }

    /**
     * ULSAConfigクラスとの連携を設定
     */
    setUlsaConfig(ulsaConfig) {
        this.ulsaConfig = ulsaConfig;
    }
}
