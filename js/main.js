/**
 * メインアプリケーションクラス
 * 各機能モジュールを統合管理
 */
class SerialConfigurator {
    constructor() {
        this.initializeModules();
        this.attachGlobalEventListeners();
    }

    /**
     * 各機能モジュールの初期化
     */
    initializeModules() {
        // コンソール管理モジュール
        const consoleElement = document.getElementById('console');
        this.consoleManager = new ConsoleManager(consoleElement);

        // シリアル接続管理モジュール
        this.serialConnection = new SerialConnection(this.consoleManager);

        // ULSA設定管理モジュール
        this.ulsaConfig = new ULSAConfig(this.serialConnection, this.consoleManager);
        
        // 初期化完了ログ
        this.consoleManager.logToConsole('info', 'SerialConfigurator初期化完了');
        this.consoleManager.logToConsole('debug', 'ULSAConfig初期化完了');

        // 複数デバイス管理モジュール
        this.multiDeviceManager = new MultiDeviceManager(this.consoleManager);
        
        // グローバルアクセス用（HTML内のonclickイベントで使用）
        window.multiDeviceManager = this.multiDeviceManager;
        window.serialConfigurator = this;
        window.consoleManager = this.consoleManager;
        window.ulsaConfig = this.ulsaConfig;

        // モジュール間の連携設定
        this.setupModuleInteractions();
    }

    /**
     * モジュール間の連携を設定
     */
    setupModuleInteractions() {
        // ULSAConfigとSerialConnectionの連携
        this.serialConnection.setUlsaConfig(this.ulsaConfig);
        
        // シリアル接続状態変更時に他のモジュールに通知
        const originalUpdateButtonStates = this.serialConnection.updateButtonStates.bind(this.serialConnection);
        this.serialConnection.updateButtonStates = () => {
            originalUpdateButtonStates();
            const connectionState = this.serialConnection.getConnectionState();
            this.ulsaConfig.updateButtonStates(connectionState.isConnected);
        };
    }

    /**
     * グローバルイベントリスナーの設定
     */
    attachGlobalEventListeners() {
        // エラーハンドリング
        window.addEventListener('error', (event) => {
            // console.error('Unhandled error:', event.error);
            this.consoleManager.logToConsole('error', `予期しないエラー: ${event.error.message}`);
        });

        window.addEventListener('unhandledrejection', (event) => {
            // console.error('Unhandled promise rejection:', event.reason);
            this.consoleManager.logToConsole('error', `Promise エラー: ${event.reason}`);
        });
    }
}

// アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    new SerialConfigurator();
});
