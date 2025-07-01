/**
 * 複数デバイス管理クラス
 * 複数のULSAデバイスへの同時接続・設定送信を管理
 */
class MultiDeviceManager {
    constructor(consoleManager) {
        this.consoleManager = consoleManager;
        this.devices = new Map(); // deviceId -> deviceInfo
        this.nextDeviceId = 1;
        
        // UI要素の初期化
        this.initializeUIElements();
        this.attachEventListeners();
    }

    /**
     * UI要素の初期化
     */
    initializeUIElements() {
        // 複数デバイス管理用のUI要素を取得
        this.deviceListContainer = document.getElementById('deviceList');
        this.addDeviceBtn = document.getElementById('addDeviceBtn');

        this.batchProgressContainer = document.getElementById('batchProgress');
        this.deviceCountElement = document.getElementById('deviceCount');
        this.disconnectAllBtn = document.getElementById('disconnectAllBtn');
        
        // モード切り替え要素
        this.singleModeBtn = document.getElementById('singleModeBtn');
        this.multiModeBtn = document.getElementById('multiModeBtn');
        this.singleDeviceMode = document.getElementById('singleDeviceMode');
        this.multiDeviceMode = document.getElementById('multiDeviceMode');
        
        // コンソール切り替え要素
        this.singleConsoleContainer = document.getElementById('singleConsoleContainer');
        this.multiConsoleContainer = document.getElementById('multiConsoleContainer');
        this.deviceConsolesContainer = document.getElementById('deviceConsoles');
        
        // デバイス別コンソール管理
        this.deviceConsoles = new Map(); // deviceId -> console element
        this.deviceReaders = new Map(); // deviceId -> reader monitoring
        this.deviceBuffers = new Map(); // deviceId -> 受信データバッファ
    }

    /**
     * イベントリスナーの設定
     */
    attachEventListeners() {
        // マルチデバイス操作
        if (this.addDeviceBtn) {
            this.addDeviceBtn.addEventListener('click', () => this.addDevice());
        }
        

        
        if (this.disconnectAllBtn) {
            this.disconnectAllBtn.addEventListener('click', () => this.disconnectAllDevices());
        }
        
        // モード切り替え
        if (this.singleModeBtn) {
            this.singleModeBtn.addEventListener('click', () => this.switchToSingleMode());
        }
        
        if (this.multiModeBtn) {
            this.multiModeBtn.addEventListener('click', () => this.switchToMultiMode());
        }
        
        // セカンダリクリアボタン
        const clearConsoleBtn2 = document.getElementById('clearConsoleBtn2');
        if (clearConsoleBtn2) {
            clearConsoleBtn2.addEventListener('click', () => {
                if (window.serialConfigurator && window.serialConfigurator.consoleManager) {
                    window.serialConfigurator.consoleManager.clearConsole();
                }
            });
        }
    }

    /**
     * 新しいデバイスを追加
     */
    async addDevice() {
        try {
            this.consoleManager.logToConsole('info', 'デバイスの選択を待機中...');
            
            // Web Serial APIでデバイスを選択
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200 });
            
            // デバイス情報を作成
            const deviceId = 'device_' + this.nextDeviceId++;
            const deviceInfo = {
                id: deviceId,
                port: port,
                reader: null,
                writer: null,
                status: 'connected',
                name: 'ULSA Device ' + deviceId.split('_')[1],
                connected: true
            };
            
            // リーダーとライターを設定
            deviceInfo.reader = port.readable.getReader();
            deviceInfo.writer = port.writable.getWriter();
            
            // デバイスマップに追加
            this.devices.set(deviceId, deviceInfo);
            
            // デバイス別コンソールを作成
            this.createDeviceConsole(deviceId, deviceInfo);
            
            // リーダー監視を開始
            this.startReaderMonitoring(deviceId, deviceInfo);
            
            // UIを更新
            this.updateDeviceList();
            this.updateBatchControls();
            this.updateConsoleDisplay();
            
            this.consoleManager.logToConsole('success', deviceInfo.name + 'が接続されました');
            
            // マルチデバイス接続時のオーバーレイ表示
            this.showConfigurationOverlay();
            
            return deviceId;
            
        } catch (error) {
            if (error.name === 'NotFoundError') {
                this.consoleManager.logToConsole('info', 'デバイス選択がキャンセルされました');
            } else {
                this.consoleManager.logToConsole('error', 'デバイス追加エラー: ' + error.message);
            }
            throw error;
        }
    }

    /**
     * デバイスを削除
     */
    async removeDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) return;
        
        try {
            // リーダー監視を停止
            this.stopReaderMonitoring(deviceId);
            
            // 接続を閉じる
            if (device.reader) {
                await device.reader.cancel();
                device.reader.releaseLock();
            }
            if (device.writer) {
                device.writer.releaseLock();
            }
            if (device.port) {
                await device.port.close();
            }
            
            // デバイスマップから削除
            this.devices.delete(deviceId);
            
            // デバイス別コンソールを削除
            this.removeDeviceConsole(deviceId);
            
            // UIを更新
            this.updateDeviceList();
            this.updateBatchControls();
            this.updateConsoleDisplay();
            
            this.consoleManager.logToConsole('info', device.name + 'が切断されました');
            
        } catch (error) {
            this.consoleManager.logToConsole('error', 'デバイス切断エラー: ' + error.message);
        }
    }

    /**
     * デバイスリストUIを更新
     */
    updateDeviceList() {
        if (!this.deviceListContainer) return;
        
        this.deviceListContainer.innerHTML = '';
        
        for (const [deviceId, device] of this.devices) {
            const deviceElement = this.createDeviceElement(device);
            this.deviceListContainer.appendChild(deviceElement);
        }
    }

    /**
     * デバイス要素を作成
     */
    createDeviceElement(device) {
        const element = document.createElement('div');
        element.className = 'device-item';
        element.innerHTML = 
            '<div class="device-info">' +
                '<div class="device-name">' + device.name + '</div>' +
                '<div class="device-status ' + device.status + '">' +
                    '<span class="status-indicator"></span>' +
                    (device.status === 'connected' ? '接続中' : '切断') +
                '</div>' +
            '</div>' +
            '<div class="device-controls">' +
                '<button class="btn btn-small btn-outline" onclick="multiDeviceManager.removeDevice(\'' + device.id + '\')">' +
                    '<i class="fas fa-times"></i>' +
                    '切断' +
                '</button>' +
            '</div>';
        return element;
    }

    /**
     * 一括制御ボタンの状態を更新
     */
    updateBatchControls() {
        const hasDevices = this.devices.size > 0;
        
        // モードの切り替え
        this.updateModeDisplay();
    }

    /**
     * シングルデバイスモードに切り替え
     */
    switchToSingleMode() {
        // ボタンの状態を更新
        if (this.singleModeBtn) this.singleModeBtn.classList.add('active');
        if (this.multiModeBtn) this.multiModeBtn.classList.remove('active');
        
        // UI表示を切り替え
        if (this.singleDeviceMode) this.singleDeviceMode.style.display = 'block';
        if (this.multiDeviceMode) this.multiDeviceMode.style.display = 'none';
        
        this.consoleManager.logToConsole('info', 'シングルデバイスモードに切り替えました');
    }
    
    /**
     * マルチデバイスモードに切り替え
     */
    switchToMultiMode() {
        // ボタンの状態を更新
        if (this.singleModeBtn) this.singleModeBtn.classList.remove('active');
        if (this.multiModeBtn) this.multiModeBtn.classList.add('active');
        
        // UI表示を切り替え
        if (this.singleDeviceMode) this.singleDeviceMode.style.display = 'none';
        if (this.multiDeviceMode) this.multiDeviceMode.style.display = 'block';
        
        this.consoleManager.logToConsole('info', 'マルチデバイスモードに切り替えました');
    }
    
    /**
     * 表示モードの更新（デバイス数表示など）
     */
    updateModeDisplay() {
        // デバイス数を更新
        if (this.deviceCountElement) {
            this.deviceCountElement.textContent = this.devices.size;
        }
        
        // 一括操作ボタンの状態を更新
        const hasDevices = this.devices.size > 0;
        if (this.disconnectAllBtn) {
            this.disconnectAllBtn.disabled = !hasDevices;
        }
    }

    /**
     * デバイス別コンソールを作成
     */
    createDeviceConsole(deviceId, device) {
        if (!this.deviceConsolesContainer) return;
        
        const consoleElement = document.createElement('div');
        consoleElement.className = 'device-console';
        consoleElement.id = `console-${deviceId}`;
        
        consoleElement.innerHTML = `
            <div class="device-console-header">
                <div class="device-console-title">
                    <div class="device-status-indicator"></div>
                    <i class="fas fa-microchip"></i>
                    ${device.name}
                </div>
                <div class="device-console-controls">
                    <button class="btn btn-small" title="このコンソールをクリア" onclick="multiDeviceManager.clearDeviceConsole('${deviceId}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="device-console-container">
                <div class="device-console-output" id="console-output-${deviceId}"></div>
            </div>
            <div class="device-console-stats">
                <span>送信: <span id="sent-count-${deviceId}">0</span>件</span>
                <span>受信: <span id="received-count-${deviceId}">0</span>件</span>
                <span>状態: <span id="status-${deviceId}">接続中</span></span>
            </div>
        `;
        
        this.deviceConsolesContainer.appendChild(consoleElement);
        this.deviceConsoles.set(deviceId, {
            element: consoleElement,
            output: consoleElement.querySelector(`#console-output-${deviceId}`),
            sentCount: 0,
            receivedCount: 0
        });
        
        // 受信データバッファを初期化
        this.deviceBuffers.set(deviceId, '');
    }

    /**
     * デバイス別コンソールを削除
     */
    removeDeviceConsole(deviceId) {
        const consoleInfo = this.deviceConsoles.get(deviceId);
        if (consoleInfo && consoleInfo.element) {
            consoleInfo.element.remove();
        }
        this.deviceConsoles.delete(deviceId);
        this.deviceBuffers.delete(deviceId);
    }

    /**
     * デバイス別コンソールにログを追加
     */
    logToDeviceConsole(deviceId, message, type = 'info') {
        const consoleInfo = this.deviceConsoles.get(deviceId);
        if (!consoleInfo) return;
        
        const timestamp = new Date().toLocaleTimeString('ja-JP', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            fractionalSecondDigits: 1
        });
        
        const logEntry = document.createElement('div');
        logEntry.className = `console-entry console-${type}`;
        
        let icon = '';
        switch (type) {
            case 'sent': icon = '→'; break;
            case 'received': icon = '←'; break;
            case 'info': icon = 'ℹ'; break;
            case 'success': icon = '✅'; break;
            case 'error': icon = '❌'; break;
            case 'warning': icon = '⚠️'; break;
            default: icon = '•'; break;
        }
        
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${icon} ${message}`;
        consoleInfo.output.appendChild(logEntry);
        
        // 統計更新
        if (type === 'sent') {
            consoleInfo.sentCount++;
            document.getElementById(`sent-count-${deviceId}`).textContent = consoleInfo.sentCount;
        } else if (type === 'received') {
            consoleInfo.receivedCount++;
            document.getElementById(`received-count-${deviceId}`).textContent = consoleInfo.receivedCount;
        }
        
        // 自動スクロール
        consoleInfo.output.scrollTop = consoleInfo.output.scrollHeight;
    }

    /**
     * デバイス別コンソールをクリア
     */
    clearDeviceConsole(deviceId) {
        const consoleInfo = this.deviceConsoles.get(deviceId);
        if (consoleInfo) {
            consoleInfo.output.innerHTML = '';
            consoleInfo.sentCount = 0;
            consoleInfo.receivedCount = 0;
            document.getElementById(`sent-count-${deviceId}`).textContent = '0';
            document.getElementById(`received-count-${deviceId}`).textContent = '0';
            // バッファもクリア
            this.deviceBuffers.set(deviceId, '');
        }
    }

    /**
     * コンソール表示を更新
     */
    updateConsoleDisplay() {
        const hasDevices = this.devices.size > 0;
        
        if (this.singleConsoleContainer && this.multiConsoleContainer) {
            if (hasDevices) {
                this.singleConsoleContainer.style.display = 'none';
                this.multiConsoleContainer.style.display = 'block';
            } else {
                this.singleConsoleContainer.style.display = 'block';
                this.multiConsoleContainer.style.display = 'none';
            }
        }
    }

    /**
     * 接続されたデバイス数を取得
     */
    getDeviceCount() {
        return this.devices.size;
    }

    /**
     * すべてのデバイスを切断
     */
    async disconnectAllDevices() {
        const promises = Array.from(this.devices.keys()).map(deviceId => 
            this.removeDevice(deviceId)
        );
        
        await Promise.all(promises);
        this.consoleManager.logToConsole('info', 'すべてのデバイスが切断されました');
    }

    /**
     * リーダー監視を開始
     */
    async startReaderMonitoring(deviceId, device) {
        if (!device.reader) return;
        
        const readerMonitor = {
            active: true,
            reader: device.reader
        };
        
        this.deviceReaders.set(deviceId, readerMonitor);
        
        try {
            while (readerMonitor.active) {
                const { value, done } = await device.reader.read();
                if (done) break;
                
                // 受信データをデコード
                const receivedText = new TextDecoder().decode(value);
                this.processReceivedData(deviceId, receivedText);
            }
        } catch (error) {
            if (readerMonitor.active) {
                this.logToDeviceConsole(deviceId, `受信エラー: ${error.message}`, 'error');
            }
        }
    }

    /**
     * 受信データを処理（改行コードを待って表示）
     */
    processReceivedData(deviceId, data) {
        if (!data) return;
        
        // 現在のバッファに追加
        let buffer = this.deviceBuffers.get(deviceId) || '';
        buffer += data;
        
        // 改行コードで分割（\r\n、\n、\rに対応）
        const lines = buffer.split(/\r\n|\n|\r/);
        
        // 最後の要素は不完全な可能性があるので保持
        const incompleteLineIndex = lines.length - 1;
        const incompleteLine = lines[incompleteLineIndex];
        
        // 完全な行（改行コードで終わっている行）を表示
        for (let i = 0; i < incompleteLineIndex; i++) {
            const line = lines[i].trim();
            if (line) {
                this.logToDeviceConsole(deviceId, line, 'received');
            }
        }
        
        // 不完全な行をバッファに保存
        this.deviceBuffers.set(deviceId, incompleteLine);
    }

    /**
     * リーダー監視を停止
     */
    stopReaderMonitoring(deviceId) {
        const readerMonitor = this.deviceReaders.get(deviceId);
        if (readerMonitor) {
            readerMonitor.active = false;
            this.deviceReaders.delete(deviceId);
        }
    }

    /**
     * 設定オーバーレイを表示（マルチデバイス用）
     */
    showConfigurationOverlay() {
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
                this.consoleManager.logToConsole('info', 'マルチデバイス用オーバーレイボタンを有効化しました');
            }
            
            this.consoleManager.logToConsole('info', 'マルチデバイス用オーバーレイを表示しました');
        } else {
            this.consoleManager.logToConsole('warning', 'configSectionまたはconfigOverlayが見つかりません');
        }

        this.consoleManager.logToConsole('info', 'ULSA設定項目を無効化しました - 「設定を読み込み」を実行してください');
    }

    /**
     * 設定オーバーレイを非表示（マルチデバイス用）
     */
    hideConfigurationOverlay() {
        // 設定エリア全体を有効化し、オーバーレイを非表示
        const configSection = document.querySelector('.config-section');
        const configOverlay = document.getElementById('configOverlay');
        if (configSection && configOverlay) {
            configSection.classList.remove('disabled');
            configOverlay.style.display = 'none';
            this.consoleManager.logToConsole('info', 'マルチデバイス用オーバーレイを非表示にしました');
        }
    }
}
