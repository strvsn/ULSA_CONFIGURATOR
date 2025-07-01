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
        
        // マルチデバイスセクションの表示制御
        this.multiDeviceSection = document.getElementById('multiDeviceSection');
        this.singleDeviceSection = document.getElementById('singleDeviceSection');
    }

    /**
     * イベントリスナーの設定
     */
    attachEventListeners() {
        if (this.addDeviceBtn) {
            this.addDeviceBtn.addEventListener('click', () => this.addDevice());
        }
        
        if (this.batchConfigBtn) {
            this.batchConfigBtn.addEventListener('click', () => this.sendBatchConfiguration());
        }
        
        // すべて切断ボタン
        const disconnectAllBtn = document.getElementById('disconnectAllBtn');
        if (disconnectAllBtn) {
            disconnectAllBtn.addEventListener('click', () => this.disconnectAllDevices());
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
     * 表示モードの更新（シングルデバイス vs マルチデバイス）
     */
    updateModeDisplay() {
        const isMultiMode = this.devices.size > 0;
        
        if (this.multiDeviceSection) {
            this.multiDeviceSection.style.display = isMultiMode ? 'block' : 'none';
        }
        
        if (this.singleDeviceSection) {
            this.singleDeviceSection.style.display = isMultiMode ? 'none' : 'block';
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
