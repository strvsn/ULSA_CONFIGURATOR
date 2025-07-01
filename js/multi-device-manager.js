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
        this.batchConfigBtn = document.getElementById('batchConfigBtn');
        this.batchProgressContainer = document.getElementById('batchProgress');
        this.deviceCountElement = document.getElementById('deviceCount');
        this.disconnectAllBtn = document.getElementById('disconnectAllBtn');
        
        // モード切り替え要素
        this.singleModeBtn = document.getElementById('singleModeBtn');
        this.multiModeBtn = document.getElementById('multiModeBtn');
        this.singleDeviceMode = document.getElementById('singleDeviceMode');
        this.multiDeviceMode = document.getElementById('multiDeviceMode');
    }

    /**
     * イベントリスナーの設定
     */
    attachEventListeners() {
        // マルチデバイス操作
        if (this.addDeviceBtn) {
            this.addDeviceBtn.addEventListener('click', () => this.addDevice());
        }
        
        if (this.batchConfigBtn) {
            this.batchConfigBtn.addEventListener('click', () => this.sendBatchConfiguration());
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
            
            // UIを更新
            this.updateDeviceList();
            this.updateBatchControls();
            
            this.consoleManager.logToConsole('success', deviceInfo.name + 'が接続されました');
            
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
            
            // UIを更新
            this.updateDeviceList();
            this.updateBatchControls();
            
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
        
        if (this.batchConfigBtn) {
            this.batchConfigBtn.disabled = !hasDevices;
        }
        
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
     * 一括設定送信
     */
    async sendBatchConfiguration() {
        if (this.devices.size === 0) {
            this.consoleManager.logToConsole('warning', '接続されたデバイスがありません');
            return;
        }

        this.consoleManager.logToConsole('info', this.devices.size + '台のデバイスに一括設定送信を開始します...');
        
        try {
            // 設定データを取得（ULSAConfigクラスから）
            const configData = this.getConfigurationData();
            
            // 各デバイスに並列で設定を送信
            const promises = Array.from(this.devices.entries()).map(([deviceId, device]) => 
                this.sendConfigurationToDevice(deviceId, device, configData)
            );
            
            // 進捗表示を開始
            this.showBatchProgress();
            
            const results = await Promise.allSettled(promises);
            
            // 結果を集計
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            this.consoleManager.logToConsole('success', 
                '一括設定完了: 成功 ' + successful + '台, 失敗 ' + failed + '台');
            
            // 進捗表示を隠す
            this.hideBatchProgress();
            
        } catch (error) {
            this.consoleManager.logToConsole('error', '一括設定エラー: ' + error.message);
            this.hideBatchProgress();
        }
    }

    /**
     * 個別デバイスに設定を送信
     */
    async sendConfigurationToDevice(deviceId, device, configData) {
        try {
            this.updateDeviceProgress(deviceId, 'sending', 0);
            
            // ULSAConfigクラスの設定送信ロジックを呼び出し
            // （実際の実装では、ULSAConfigクラスのメソッドを使用）
            await this.simulateConfigSend(device, configData);
            
            this.updateDeviceProgress(deviceId, 'success', 100);
            return { deviceId: deviceId, status: 'success' };
            
        } catch (error) {
            this.updateDeviceProgress(deviceId, 'error', 0);
            throw { deviceId: deviceId, status: 'error', error: error };
        }
    }

    /**
     * 設定送信のシミュレーション（後で実装）
     */
    async simulateConfigSend(device, configData) {
        // TODO: 実際のULSA設定送信ロジックを実装
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * 設定データを取得
     */
    getConfigurationData() {
        // TODO: ULSAConfigクラスから現在の設定を取得
        return {
            nodeId: 0,
            usbProtocol: 2,
            usbBaudrate: 5,
            // ... その他の設定
        };
    }

    /**
     * デバイスの進捗を更新
     */
    updateDeviceProgress(deviceId, status, progress) {
        // TODO: 進捗表示UIの更新を実装
        console.log('Device ' + deviceId + ': ' + status + ' - ' + progress + '%');
    }

    /**
     * 一括進捗表示
     */
    showBatchProgress() {
        if (this.batchProgressContainer) {
            this.batchProgressContainer.style.display = 'block';
        }
    }

    /**
     * 一括進捗非表示
     */
    hideBatchProgress() {
        if (this.batchProgressContainer) {
            this.batchProgressContainer.style.display = 'none';
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
}
