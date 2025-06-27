/**
 * ULSA設定管理クラス
 * ULSA デバイスの設定送信・読み込み機能
 */
class ULSAConfig {
    constructor(serialConnection, consoleManager) {
        this.serialConnection = serialConnection;
        this.consoleManager = consoleManager;
        
        // カウントダウン関連の変数を初期化
        this.countdownInterval = null;
        this.remainingSeconds = 0;
        
        this.initializeUIElements();
        this.attachEventListeners();
    }

    initializeUIElements() {
        // ULSA設定ボタン
        this.sendConfigBtn = document.getElementById('sendConfigBtn');
        this.overlayReadConfigBtn = document.getElementById('overlayReadConfigBtn');
        // 設定ファイルロードボタン
        this.loadConfigFileBtn = document.getElementById('loadConfigFileBtn');
        // 設定ファイルセーブボタン
        this.saveConfigFileBtn = document.getElementById('saveConfigFileBtn');

        // ノードID
        this.enableNodeIdCheckbox = document.getElementById('enableNodeId');
        this.nodeIdInput = document.getElementById('nodeId');

        // USBポート設定
        this.enableUsbProtocolCheckbox = document.getElementById('enableUsbProtocol');
        this.usbProtocolSelect = document.getElementById('usbProtocol');
        this.enableUsbBaudrateCheckbox = document.getElementById('enableUsbBaudrate');
        this.usbBaudrateSelect = document.getElementById('usbBaudrate');
        this.enableUsbOutputRateCheckbox = document.getElementById('enableUsbOutputRate');
        this.usbOutputRateSelect = document.getElementById('usbOutputRate');

        // AUXポート設定
        this.enableAuxProtocolCheckbox = document.getElementById('enableAuxProtocol');
        this.auxProtocolSelect = document.getElementById('auxProtocol');
        this.enableAuxBaudrateCheckbox = document.getElementById('enableAuxBaudrate');
        this.auxBaudrateSelect = document.getElementById('auxBaudrate');
        this.enableAuxOutputRateCheckbox = document.getElementById('enableAuxOutputRate');
        this.auxOutputRateSelect = document.getElementById('auxOutputRate');

        // M5Bポート設定
        this.enableM5bProtocolCheckbox = document.getElementById('enableM5bProtocol');
        this.m5bProtocolSelect = document.getElementById('m5bProtocol');
        this.enableM5bBaudrateCheckbox = document.getElementById('enableM5bBaudrate');
        this.m5bBaudrateSelect = document.getElementById('m5bBaudrate');
        this.enableM5bOutputRateCheckbox = document.getElementById('enableM5bOutputRate');
        this.m5bOutputRateSelect = document.getElementById('m5bOutputRate');

        // 平均化サイクル設定
        this.enableAveragingCycleCheckbox = document.getElementById('enableAveragingCycle');
        this.averagingCycleSelect = document.getElementById('averagingCycle');
          // 工場出荷時設定ボタン
        this.applyFactoryDefaultsBtn = document.getElementById('applyFactoryDefaultsBtn');
        if (this.applyFactoryDefaultsBtn) {
            this.applyFactoryDefaultsBtn.addEventListener('click', async () => {
                if (!this.serialConnection.isConnected || !this.serialConnection.writer) {
                    this.consoleManager.logToConsole('error', 'シリアルポートが接続されていません');
                    return;
                }

                // 設定項目数を取得してカウントダウン時間を計算（Fコマンド分も含める）
                const configItems = this.getCheckedConfigItems();
                const totalItems = configItems.length;
                // Fコマンド(0.5秒) + 各設定項目で3秒(1.5秒×2) + 最終シーケンス4秒 = 合計時間
                const totalSeconds = totalItems * 3 + 5; // Fコマンド分も含めて5秒

                try {
                    this.consoleManager.logToConsole('info', '工場出荷時設定を開始します...');

                    // ボタンを送信中状態に変更
                    this.updateSendButtonState('sending', totalSeconds);

                    // 送信中は読み込みボタンも無効化
                    if (this.overlayReadConfigBtn) {
                        this.overlayReadConfigBtn.disabled = true;
                        this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
                    }

                    // カウントダウンタイマーを開始
                    this.startCountdown(totalSeconds);

                    const writer = this.serialConnection.writer;
                    
                    // 1. "F"コマンド送信
                    await this.sendCommand(writer, 'F');
                    await this.delay(500);
                    
                    // 2. 「設定を送信」ボタンと同じシーケンスを実施
                    await this.sendConfigurationSequence(writer);
                    await this.sendFinalSequence(writer);

                    this.consoleManager.logToConsole('success', '工場出荷時設定が完了しました');

                    // カウントダウンを停止してボタンを復旧
                    this.stopCountdown();

                    // 設定送信完了後に読み込みボタンを確実に有効化
                    setTimeout(() => {
                        if (this.overlayReadConfigBtn) {
                            // オーバーレイを表示
                            const configOverlay = document.getElementById('configOverlay');
                            if (configOverlay) {
                                configOverlay.style.display = 'flex';
                                configOverlay.style.pointerEvents = 'auto';
                                configOverlay.style.zIndex = '1000';
                                configOverlay.style.background = 'rgba(255, 255, 255, 0.5)';
                                configOverlay.style.backdropFilter = 'blur(0.5px)';
                            }

                            // ボタンを有効化
                            this.overlayReadConfigBtn.disabled = false;
                            this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-download"></i> デバイス設定を読み込み';
                            this.overlayReadConfigBtn.style.opacity = '';
                            this.consoleManager.logToConsole('info', '読み込みボタンを再有効化しました');
                        }
                    }, 100);

                } catch (error) {
                    this.consoleManager.logToConsole('error', `工場出荷時設定エラー: ${error.message}`);
                    // エラー時もカウントダウンを停止
                    this.stopCountdown();
                } finally {
                    // カウントダウンを停止（二重呼び出しでも安全）
                    this.stopCountdown();

                    // 設定送信完了後に読み込みボタンを再度有効化
                    if (this.overlayReadConfigBtn) {
                        // オーバーレイを表示
                        const configOverlay = document.getElementById('configOverlay');
                        if (configOverlay) {
                            configOverlay.style.display = 'flex';
                            configOverlay.style.pointerEvents = 'auto';
                            configOverlay.style.zIndex = '1000';
                            configOverlay.style.background = 'rgba(255, 255, 255, 0.5)';
                            configOverlay.style.backdropFilter = 'blur(0.5px)';
                        }

                        this.overlayReadConfigBtn.disabled = false;
                        this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-download"></i> デバイス設定を読み込み';
                        this.overlayReadConfigBtn.style.opacity = '';
                    }
                }
            });
        }

        // 初期状態設定：すべてのチェックボックスをオフ、コントロールを無効にする
        this.initializeDefaultStates();
    }

    /**
     * デフォルト状態の初期化
     */
    initializeDefaultStates() {
        // すべてのチェックボックスをオフに設定
        this.enableNodeIdCheckbox.checked = false;
        this.enableUsbProtocolCheckbox.checked = false;
        this.enableUsbBaudrateCheckbox.checked = false;
        this.enableUsbOutputRateCheckbox.checked = false;
        this.enableAuxProtocolCheckbox.checked = false;
        this.enableAuxBaudrateCheckbox.checked = false;
        this.enableAuxOutputRateCheckbox.checked = false;
        this.enableM5bProtocolCheckbox.checked = false;
        this.enableM5bBaudrateCheckbox.checked = false;
        this.enableM5bOutputRateCheckbox.checked = false;
        this.enableAveragingCycleCheckbox.checked = false;

        // 対応するコントロールを無効に設定
        this.nodeIdInput.disabled = true;
        this.usbProtocolSelect.disabled = true;
        this.usbBaudrateSelect.disabled = true;
        this.usbOutputRateSelect.disabled = true;
        this.auxProtocolSelect.disabled = true;
        this.auxBaudrateSelect.disabled = true;
        this.auxOutputRateSelect.disabled = true;
        this.m5bProtocolSelect.disabled = true;
        this.m5bBaudrateSelect.disabled = true;
        this.m5bOutputRateSelect.disabled = true;
        this.averagingCycleSelect.disabled = true;
        
        // 初期状態で送信ボタンの有効性をチェック
        this.updateSendButtonAvailability();
    }

    attachEventListeners() {
        // 設定ボタン
        this.sendConfigBtn.addEventListener('click', () => this.sendConfiguration());

        // 設定ファイルロードボタン
        if (this.loadConfigFileBtn) {
            this.loadConfigFileBtn.addEventListener('click', () => this.handleLoadConfigFile());
        }

        // オーバーレイの読み込みボタン
        if (this.overlayReadConfigBtn) {
            // ボタンの存在と状態を確認
            this.consoleManager.logToConsole('info', `overlayReadConfigBtnが見つかりました。ID: ${this.overlayReadConfigBtn.id}`);
            this.consoleManager.logToConsole('info', `ボタンの表示状態: display=${this.overlayReadConfigBtn.style.display}, visibility=${this.overlayReadConfigBtn.style.visibility}`);
            
            this.overlayReadConfigBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.consoleManager.logToConsole('info', 'overlayReadConfigBtnがクリックされました');
                this.readConfiguration();
            });
            
            // マウスイベントも追加でテスト
            this.overlayReadConfigBtn.addEventListener('mouseenter', () => {
                this.consoleManager.logToConsole('info', 'overlayReadConfigBtnにマウスが入りました');
            });
            
            this.overlayReadConfigBtn.addEventListener('mouseleave', () => {
                this.consoleManager.logToConsole('info', 'overlayReadConfigBtnからマウスが出ました');
            });
            
            this.consoleManager.logToConsole('info', 'overlayReadConfigBtnにイベントリスナーを設定しました');
        } else {
            this.consoleManager.logToConsole('error', 'overlayReadConfigBtnが見つかりません');
        }

        // 設定ファイルセーブボタン
        if (this.saveConfigFileBtn) {
            this.saveConfigFileBtn.addEventListener('click', () => this.handleSaveConfigFile());
        }

        // チェックボックスによる有効/無効制御
        this.enableNodeIdCheckbox.addEventListener('change', (e) => {
            this.nodeIdInput.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        this.enableUsbProtocolCheckbox.addEventListener('change', (e) => {
            this.usbProtocolSelect.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        this.enableUsbBaudrateCheckbox.addEventListener('change', (e) => {
            this.usbBaudrateSelect.disabled = !e.target.checked;
            this.updateOutputRateOptions('usb');
            this.updateSendButtonAvailability();
        });

        this.enableUsbOutputRateCheckbox.addEventListener('change', (e) => {
            this.usbOutputRateSelect.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        this.enableAuxProtocolCheckbox.addEventListener('change', (e) => {
            this.auxProtocolSelect.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        this.enableAuxBaudrateCheckbox.addEventListener('change', (e) => {
            this.auxBaudrateSelect.disabled = !e.target.checked;
            this.updateOutputRateOptions('aux');
            this.updateSendButtonAvailability();
        });

        this.enableAuxOutputRateCheckbox.addEventListener('change', (e) => {
            this.auxOutputRateSelect.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        this.enableM5bProtocolCheckbox.addEventListener('change', (e) => {
            this.m5bProtocolSelect.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        this.enableM5bBaudrateCheckbox.addEventListener('change', (e) => {
            this.m5bBaudrateSelect.disabled = !e.target.checked;
            this.updateOutputRateOptions('m5b');
            this.updateSendButtonAvailability();
        });

        this.enableM5bOutputRateCheckbox.addEventListener('change', (e) => {
            this.m5bOutputRateSelect.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        this.enableAveragingCycleCheckbox.addEventListener('change', (e) => {
            this.averagingCycleSelect.disabled = !e.target.checked;
            this.updateSendButtonAvailability();
        });

        // ボーレート変更時の出力レート制限
        this.usbBaudrateSelect.addEventListener('change', () => this.updateOutputRateOptions('usb'));
        this.auxBaudrateSelect.addEventListener('change', () => this.updateOutputRateOptions('aux'));
        this.m5bBaudrateSelect.addEventListener('change', () => this.updateOutputRateOptions('m5b'));
    }

    /**
     * 出力レートオプションの更新
     */
    updateOutputRateOptions(portType) {
        let baudrateSelect, outputRateSelect, enableBaudrateCheckbox, enableOutputRateCheckbox;
        
        switch (portType) {
            case 'usb':
                baudrateSelect = this.usbBaudrateSelect;
                outputRateSelect = this.usbOutputRateSelect;
                enableBaudrateCheckbox = this.enableUsbBaudrateCheckbox;
                enableOutputRateCheckbox = this.enableUsbOutputRateCheckbox;
                break;
            case 'aux':
                baudrateSelect = this.auxBaudrateSelect;
                outputRateSelect = this.auxOutputRateSelect;
                enableBaudrateCheckbox = this.enableAuxBaudrateCheckbox;
                enableOutputRateCheckbox = this.enableAuxOutputRateCheckbox;
                break;
            case 'm5b':
                baudrateSelect = this.m5bBaudrateSelect;
                outputRateSelect = this.m5bOutputRateSelect;
                enableBaudrateCheckbox = this.enableM5bBaudrateCheckbox;
                enableOutputRateCheckbox = this.enableM5bOutputRateCheckbox;
                break;
            default:
                return;
        }

        if (!enableBaudrateCheckbox.checked || !enableOutputRateCheckbox.checked) {
            return;
        }

        // 115200bps以外の場合は1Hzのみ有効
        const is115200 = baudrateSelect.value === '5'; // 115200bpsは値が5
        const options = outputRateSelect.options;
        
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            if (i === 0) {
                // 1Hzは常に有効
                option.disabled = false;
            } else {
                // 2Hz以上は115200bpsでのみ有効
                option.disabled = !is115200;
            }
        }

        // 現在選択されているオプションが無効になった場合は1Hzに戻す
        if (outputRateSelect.options[outputRateSelect.selectedIndex].disabled) {
            outputRateSelect.value = '0';
        }
    }

    /**
     * 設定をデバイスに送信
     */
    async sendConfiguration() {
        // console.log('sendConfiguration が呼び出されました');
        
        const connectionState = this.serialConnection.getConnectionState();
        if (!connectionState.isConnected || !connectionState.writer) {
            this.consoleManager.logToConsole('error', 'シリアルポートが接続されていません');
            return;
        }

        // 設定項目数を取得してカウントダウン時間を計算
        const configItems = this.getCheckedConfigItems();
        const totalItems = configItems.length;
        // 各設定項目で3秒(1.5秒×2) + 最終シーケンス4秒(1.5+2+0.5待機調整) = 合計時間
        const totalSeconds = totalItems * 3 + 4; // より正確な送信時間に合わせて4秒
        
        // console.log(`設定項目数: ${totalItems}, 計算された総時間: ${totalSeconds}秒`);
        
        try {
            this.consoleManager.logToConsole('info', '設定送信を開始します...');
            
            // ボタンを送信中状態に変更
            // console.log('updateSendButtonState("sending") を呼び出します');
            this.updateSendButtonState('sending', totalSeconds);
            
            // 送信中は読み込みボタンも無効化
            if (this.overlayReadConfigBtn) {
                this.overlayReadConfigBtn.disabled = true;
                this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
            }
            
            // カウントダウンタイマーを開始
            // console.log('startCountdown を呼び出します');
            this.startCountdown(totalSeconds);
            
            // チェックされた設定項目を順次送信
            await this.sendConfigurationSequence(connectionState.writer);
            
            // 最後のシーケンス（保存、表示、読み込み、再起動）
            await this.sendFinalSequence(connectionState.writer);
            
            this.consoleManager.logToConsole('success', '設定送信が完了しました');
            
            // カウントダウンを停止してボタンを復旧
            this.stopCountdown();
            
            // 設定送信完了後に読み込みボタンを確実に有効化
            setTimeout(() => {
                if (this.overlayReadConfigBtn) {
                    // オーバーレイを表示
                    const configOverlay = document.getElementById('configOverlay');
                    if (configOverlay) {
                        configOverlay.style.display = 'flex';
                        configOverlay.style.pointerEvents = 'auto';
                        configOverlay.style.zIndex = '1000';
                        // CSSの初期状態と同じ背景色に統一
                        configOverlay.style.background = 'rgba(255, 255, 255, 0.5)';
                        configOverlay.style.backdropFilter = 'blur(0.5px)';
                    }
                    
                    // ボタンを有効化
                    this.overlayReadConfigBtn.disabled = false;
                    this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-download"></i> デバイス設定を読み込み';
                    // ボタンの透明度を明示的にリセット
                    this.overlayReadConfigBtn.style.opacity = '';
                    this.consoleManager.logToConsole('info', '読み込みボタンを再有効化しました');
                }
            }, 100);
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `設定送信エラー: ${error.message}`);
            // エラー時もカウントダウンを停止
            this.stopCountdown();
        } finally {
            // カウントダウンを停止（二重呼び出しでも安全）
            this.stopCountdown();
            
            // 設定送信完了後に読み込みボタンを再度有効化
            if (this.overlayReadConfigBtn) {
                // オーバーレイを表示
                const configOverlay = document.getElementById('configOverlay');
                if (configOverlay) {
                    configOverlay.style.display = 'flex';
                    configOverlay.style.pointerEvents = 'auto';
                    configOverlay.style.zIndex = '1000';
                    // CSSの初期状態と同じ背景色に統一
                    configOverlay.style.background = 'rgba(255, 255, 255, 0.5)';
                    configOverlay.style.backdropFilter = 'blur(0.5px)';
                }
                
                this.overlayReadConfigBtn.disabled = false;
                this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-download"></i> デバイス設定を読み込み';
                // ボタンの透明度を明示的にリセット
                this.overlayReadConfigBtn.style.opacity = '';
            }
        }
    }

    /**
     * チェックされた設定項目を順次送信
     */
    async sendConfigurationSequence(writer) {
        const configItems = this.getCheckedConfigItems();
        
        for (const item of configItems) {
            // KEYを送信 (例: "A\r")
            await this.sendCommand(writer, item.key);
            await this.delay(1500);
            
            // 設定値を送信 (例: "1\r")
            await this.sendCommand(writer, item.value);
            await this.delay(1500);
            
            this.consoleManager.logToConsole('info', `設定送信完了: [${item.key}] = ${item.value} (${item.description})`);
        }
    }

    /**
     * 最終シーケンス（保存、表示、読み込み、再起動）
     */
    async sendFinalSequence(writer) {
        // 1. セーブコマンド"S\r"を送信
        this.consoleManager.logToConsole('info', '設定を保存中...');
        await this.sendCommand(writer, 'S');
        await this.delay(1500);
        
        // 2. Configuration List表示コマンド"?\r"を送信
        this.consoleManager.logToConsole('info', '設定値を取得中...');
        await this.sendCommand(writer, '?');
        await this.delay(2000); // 設定値表示の待機時間を少し長めに
        
        // 3. 設定値を読み込んで画面に反映（SerialConnectionで自動処理される）
        this.consoleManager.logToConsole('info', '設定値を画面に反映中...');
        
        // 4. 再起動コマンド"R\r"を送信
        this.consoleManager.logToConsole('info', 'デバイスを再起動中...');
        await this.sendCommand(writer, 'R');
        await this.delay(1500);
    }

    /**
     * チェックされた設定項目を取得
     */
    getCheckedConfigItems() {
        const items = [];

        // ノードID設定 [A]
        if (this.enableNodeIdCheckbox.checked) {
            items.push({
                key: 'A',
                value: this.nodeIdInput.value,
                description: 'ノードID'
            });
        }

        // USBポートプロトコル [B]
        if (this.enableUsbProtocolCheckbox.checked) {
            items.push({
                key: 'B',
                value: this.usbProtocolSelect.value,
                description: 'USBポートプロトコル'
            });
        }

        // USBポートビットレート [C]
        if (this.enableUsbBaudrateCheckbox.checked) {
            items.push({
                key: 'C',
                value: this.usbBaudrateSelect.value,
                description: 'USBポートビットレート'
            });
        }

        // USBポート出力レート [E]
        if (this.enableUsbOutputRateCheckbox.checked) {
            items.push({
                key: 'E',
                value: this.usbOutputRateSelect.value,
                description: 'USBポート出力レート'
            });
        }

        // AUXポートプロトコル [G]
        if (this.enableAuxProtocolCheckbox.checked) {
            items.push({
                key: 'G',
                value: this.auxProtocolSelect.value,
                description: 'AUXポートプロトコル'
            });
        }

        // AUXポートビットレート [H]
        if (this.enableAuxBaudrateCheckbox.checked) {
            items.push({
                key: 'H',
                value: this.auxBaudrateSelect.value,
                description: 'AUXポートビットレート'
            });
        }

        // AUXポート出力レート [I]
        if (this.enableAuxOutputRateCheckbox.checked) {
            items.push({
                key: 'I',
                value: this.auxOutputRateSelect.value,
                description: 'AUXポート出力レート'
            });
        }

        // M5Bポートプロトコル [J]
        if (this.enableM5bProtocolCheckbox.checked) {
            items.push({
                key: 'J',
                value: this.m5bProtocolSelect.value,
                description: 'M5Bポートプロトコル'
            });
        }

        // M5Bポートビットレート [K]
        if (this.enableM5bBaudrateCheckbox.checked) {
            items.push({
                key: 'K',
                value: this.m5bBaudrateSelect.value,
                description: 'M5Bポートビットレート'
            });
        }

        // M5Bポート出力レート [M]
        if (this.enableM5bOutputRateCheckbox.checked) {
            items.push({
                key: 'M',
                value: this.m5bOutputRateSelect.value,
                description: 'M5Bポート出力レート'
            });
        }

        // 平均化サイクル [N]
        if (this.enableAveragingCycleCheckbox && this.enableAveragingCycleCheckbox.checked) {
            items.push({
                key: 'N',
                value: this.averagingCycleSelect.value,
                description: '平均化サイクル'
            });
        }

        return items;
    }

    /**
     * コマンドを送信
     */
    async sendCommand(writer, command) {
        const data = new TextEncoder().encode(command + '\r');
        await writer.write(data);
        this.consoleManager.logToConsole('sent', command);
    }

    /**
     * 指定時間待機
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * デバイスから設定を読み込み
     */
    async readConfiguration() {
        const connectionState = this.serialConnection.getConnectionState();
        if (!connectionState.isConnected) {
            this.consoleManager.logToConsole('error', 'シリアルポートが接続されていません');
            return;
        }

        try {
            // SerialConnectionの設定読み込み処理を実行
            const success = await this.serialConnection.performConfigurationRead();
            
            if (success) {
                this.consoleManager.logToConsole('success', '設定の読み込みが完了しました');
                // 設定読み込み後に送信ボタンの有効性を更新
                this.updateSendButtonAvailability();
            } else {
                this.consoleManager.logToConsole('error', '設定の読み込みに失敗しました');
            }
            
        } catch (error) {
            this.consoleManager.logToConsole('error', `設定読み込みエラー: ${error.message}`);
        }
    }

    /**
     * 接続状態変更時のボタン状態更新
     */
    updateButtonStates(isConnected) {
        if (isConnected) {
            // 接続時は、チェックボックスの状態に基づいて送信ボタンの有効性を決定
            this.updateSendButtonAvailability();
        } else {
            // 切断時は送信ボタンを無効化
            this.sendConfigBtn.disabled = true;
        }
        
        if (isConnected) {
            // 接続時：読み込みボタンを有効化し、表示をリセット
            this.overlayReadConfigBtn.disabled = false;
            this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-download"></i> デバイス設定を読み込み';
        } else {
            // 切断時：ボタンを無効化し、表示をリセット
            this.overlayReadConfigBtn.disabled = true;
            this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-download"></i> デバイス設定を読み込み';
        }
    }

    /**
     * 設定読み込み完了時の処理
     */
    onConfigurationLoaded() {
        // 設定送信完了後は読み込みボタンを有効のまま維持
        if (this.overlayReadConfigBtn) {
            this.overlayReadConfigBtn.disabled = false;
            this.overlayReadConfigBtn.innerHTML = '<i class="fas fa-download"></i> デバイス設定を読み込み';
        }
    }

    /**
     * 送信ボタンの有効性を更新（チェックボックスの状態に基づく）
     */
    updateSendButtonAvailability() {
        if (!this.sendConfigBtn) {
            // console.error('sendConfigBtn が見つかりません（有効性チェック）');
            return;
        }

        // すべてのチェックボックスの状態を確認
        const checkboxes = [
            this.enableNodeIdCheckbox,
            this.enableUsbProtocolCheckbox,
            this.enableUsbBaudrateCheckbox,
            this.enableUsbOutputRateCheckbox,
            this.enableAuxProtocolCheckbox,
            this.enableAuxBaudrateCheckbox,
            this.enableAuxOutputRateCheckbox,
            this.enableM5bProtocolCheckbox,
            this.enableM5bBaudrateCheckbox,
            this.enableM5bOutputRateCheckbox,
            this.enableAveragingCycleCheckbox
        ];

        // 少なくとも一つのチェックボックスがチェックされているかどうか
        const anyChecked = checkboxes.some(checkbox => checkbox && checkbox.checked);
        
        // ボタンの有効/無効を設定
        this.sendConfigBtn.disabled = !anyChecked;
        
        // ログ出力
        // console.log(`送信ボタン有効性更新: ${anyChecked ? '有効' : '無効'}`);
        
        // ボタンのスタイルも更新（無効時は視覚的に分かりやすく）
        if (!anyChecked) {
            this.sendConfigBtn.style.opacity = '0.5';
            this.sendConfigBtn.style.cursor = 'not-allowed';
        } else {
            this.sendConfigBtn.style.opacity = '';
            this.sendConfigBtn.style.cursor = '';
        }
    }

    /**
     * 送信ボタンの状態を更新
     */
    updateSendButtonState(state, totalSeconds = 0) {
        // console.log(`updateSendButtonState called with state: ${state}, totalSeconds: ${totalSeconds}`);
        
        if (!this.sendConfigBtn) {
            // console.error('sendConfigBtn が見つかりません');
            return;
        }
        
        switch (state) {
            case 'sending':
                // console.log('ボタンを送信中状態に変更します');
                this.sendConfigBtn.disabled = true;
                // CSSクラスを削除して、インラインスタイルを適用
                this.sendConfigBtn.classList.remove('btn-primary');
                this.sendConfigBtn.classList.add('btn-danger'); // 赤色のBootstrapクラスを追加
                this.sendConfigBtn.style.background = '#dc3545 !important'; // 赤色（linear-gradientを上書き）
                this.sendConfigBtn.style.borderColor = '#dc3545 !important';
                this.sendConfigBtn.style.boxShadow = '0 4px 15px rgba(220, 53, 69, 0.3) !important';
                this.sendConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
                // console.log('ボタンの状態変更完了 - 赤色に設定');
                break;
            case 'normal':
                // console.log('ボタンを通常状態に戻します');
                this.sendConfigBtn.disabled = false;
                // クラスを復元してインラインスタイルをクリア
                this.sendConfigBtn.classList.remove('btn-danger');
                this.sendConfigBtn.classList.add('btn-primary');
                this.sendConfigBtn.style.background = '';
                this.sendConfigBtn.style.borderColor = '';
                this.sendConfigBtn.style.boxShadow = '';
                this.sendConfigBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 設定を送信';
                // console.log('ボタンの通常状態復帰完了');
                break;
        }
    }

    /**
     * カウントダウンタイマーを開始
     */
    startCountdown(totalSeconds) {
        // console.log(`startCountdown called with totalSeconds: ${totalSeconds}`);
        
        if (!this.sendConfigBtn) {
            // console.error('sendConfigBtn が見つかりません（カウントダウン）');
            return;
        }
        
        this.remainingSeconds = totalSeconds;
        // console.log(`初期残り秒数: ${this.remainingSeconds}`);
        
        // 最初の表示を即座に更新
        this.sendConfigBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 送信中... (残り${this.remainingSeconds}秒)`;
        
        this.countdownInterval = setInterval(() => {
            this.remainingSeconds--;
            // console.log(`カウントダウン更新: 残り${this.remainingSeconds}秒`);
            
            if (this.remainingSeconds > 0) {
                const newText = `<i class="fas fa-spinner fa-spin"></i> 送信中... (残り${this.remainingSeconds}秒)`;
                this.sendConfigBtn.innerHTML = newText;
            } else {
                // console.log('カウントダウン完了、停止します');
                this.stopCountdown();
            }
        }, 1000);
        
        // console.log('カウントダウンタイマーが開始されました');
    }

    /**
     * カウントダウンタイマーを停止
     */
    stopCountdown() {
        // console.log('stopCountdown called');
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
            // console.log('カウントダウンタイマーをクリアしました');
        }
        this.remainingSeconds = 0;
        
        // ボタンの状態を通常に戻す
        // console.log('カウントダウン停止時にボタンを通常状態に戻します');
        this.updateSendButtonState('normal');
    }

    /**
     * 設定ファイルをロードするボタンのハンドラ
     */
    handleLoadConfigFile() {
        // ファイル選択ダイアログを作成
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.txt';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    let config = null;
                    try {
                        config = JSON.parse(content);
                    } catch (err) {
                        this.consoleManager.logToConsole('error', 'JSONパースに失敗しました。テキストとして処理します。');
                    }
                    if (config) {
                        this.consoleManager.logToConsole('success', '設定ファイルの読み込みに成功しました');
                        // key-value形式ならULSA配列形式に変換
                        let configArray;
                        if (Array.isArray(config)) {
                            configArray = config;
                        } else if (typeof config === 'object') {
                            configArray = [];
                            if (config.nodeId !== undefined) configArray.push({ key: 'A', value: config.nodeId });
                            if (config.usbProtocol !== undefined) configArray.push({ key: 'B', value: config.usbProtocol });
                            if (config.usbBaudrate !== undefined) configArray.push({ key: 'C', value: config.usbBaudrate });
                            if (config.usbOutputRate !== undefined) configArray.push({ key: 'E', value: config.usbOutputRate });
                            if (config.auxProtocol !== undefined) configArray.push({ key: 'G', value: config.auxProtocol });
                            if (config.auxBaudrate !== undefined) configArray.push({ key: 'H', value: config.auxBaudrate });
                            if (config.auxOutputRate !== undefined) configArray.push({ key: 'I', value: config.auxOutputRate });
                            if (config.m5bProtocol !== undefined) configArray.push({ key: 'J', value: config.m5bProtocol });
                            if (config.m5bBaudrate !== undefined) configArray.push({ key: 'K', value: config.m5bBaudrate });
                            if (config.m5bOutputRate !== undefined) configArray.push({ key: 'M', value: config.m5bOutputRate });
                            if (config.averagingCycle !== undefined) configArray.push({ key: 'N', value: config.averagingCycle });
                        } else {
                            configArray = [];
                        }
                        // 設定項目をUIに反映
                        this.applyConfigToUI(configArray);
                    }
                } catch (error) {
                    this.consoleManager.logToConsole('error', `ファイル読み込みエラー: ${error.message}`);
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    /**
     * 設定ファイルをセーブするボタンのハンドラ
     */
    handleSaveConfigFile() {
        // チェックボタンが有効なパラメータのみ取得
        const checkedItems = this.getCheckedConfigItems().map(item => {
            // valueの他に、設定値のラベルも保存
            let label = '';
            switch (item.key) {
                case 'A': label = this.nodeIdInput.options ? this.nodeIdInput.options[this.nodeIdInput.selectedIndex]?.text : item.value; break;
                case 'B': label = this.usbProtocolSelect.options[this.usbProtocolSelect.selectedIndex]?.text; break;
                case 'C': label = this.usbBaudrateSelect.options[this.usbBaudrateSelect.selectedIndex]?.text; break;
                case 'E': label = this.usbOutputRateSelect.options[this.usbOutputRateSelect.selectedIndex]?.text; break;
                case 'G': label = this.auxProtocolSelect.options[this.auxProtocolSelect.selectedIndex]?.text; break;
                case 'H': label = this.auxBaudrateSelect.options[this.auxBaudrateSelect.selectedIndex]?.text; break;
                case 'I': label = this.auxOutputRateSelect.options[this.auxOutputRateSelect.selectedIndex]?.text; break;
                case 'J': label = this.m5bProtocolSelect.options[this.m5bProtocolSelect.selectedIndex]?.text; break;
                case 'K': label = this.m5bBaudrateSelect.options[this.m5bBaudrateSelect.selectedIndex]?.text; break;
                case 'M': label = this.m5bOutputRateSelect.options[this.m5bOutputRateSelect.selectedIndex]?.text; break;
                case 'N': label = this.averagingCycleSelect.options[this.averagingCycleSelect.selectedIndex]?.text; break;
                default: label = item.value;
            }
            return { ...item, label };
        });
        const json = JSON.stringify(checkedItems, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ulsa-config.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        this.consoleManager.logToConsole('success', '設定ファイルをセーブしました（有効なパラメータのみ保存、ラベル付き）。');
    }

    /**
     * 現在のUIから設定値を収集
     */
    collectCurrentConfig() {
        return {
            nodeId: this.nodeIdInput.value,
            usbProtocol: this.usbProtocolSelect.value,
            usbBaudrate: this.usbBaudrateSelect.value,
            usbOutputRate: this.usbOutputRateSelect.value,
            auxProtocol: this.auxProtocolSelect.value,
            auxBaudrate: this.auxBaudrateSelect.value,
            auxOutputRate: this.auxOutputRateSelect.value,
            m5bProtocol: this.m5bProtocolSelect.value,
            m5bBaudrate: this.m5bBaudrateSelect.value,
            m5bOutputRate: this.m5bOutputRateSelect.value,
            averagingCycle: this.averagingCycleSelect.value
        };
    }

    /**
     * 設定項目をUIに反映
     */
    applyConfigToUI(config) {
        this.consoleManager.logToConsole('info', '設定項目をUIに反映します:', config);
        
        // ノードID
        if (config.find(item => item.key === 'A')) {
            const nodeIdItem = config.find(item => item.key === 'A');
            this.nodeIdInput.value = nodeIdItem.value;
            this.enableNodeIdCheckbox.checked = true;
            this.nodeIdInput.disabled = false;
        } else {
            this.enableNodeIdCheckbox.checked = false;
            this.nodeIdInput.disabled = true;
        }

        // USBポートプロトコル
        if (config.find(item => item.key === 'B')) {
            const usbProtocolItem = config.find(item => item.key === 'B');
            this.usbProtocolSelect.value = usbProtocolItem.value;
            this.enableUsbProtocolCheckbox.checked = true;
            this.usbProtocolSelect.disabled = false;
        } else {
            this.enableUsbProtocolCheckbox.checked = false;
            this.usbProtocolSelect.disabled = true;
        }

        // USBポートビットレート
        if (config.find(item => item.key === 'C')) {
            const usbBaudrateItem = config.find(item => item.key === 'C');
            this.usbBaudrateSelect.value = usbBaudrateItem.value;
            this.enableUsbBaudrateCheckbox.checked = true;
            this.usbBaudrateSelect.disabled = false;
        } else {
            this.enableUsbBaudrateCheckbox.checked = false;
            this.usbBaudrateSelect.disabled = true;
        }

        // USBポート出力レート
        if (config.find(item => item.key === 'E')) {
            const usbOutputRateItem = config.find(item => item.key === 'E');
            this.usbOutputRateSelect.value = usbOutputRateItem.value;
            this.enableUsbOutputRateCheckbox.checked = true;
            this.usbOutputRateSelect.disabled = false;
        } else {
            this.enableUsbOutputRateCheckbox.checked = false;
            this.usbOutputRateSelect.disabled = true;
        }

        // AUXポートプロトコル
        if (config.find(item => item.key === 'G')) {
            const auxProtocolItem = config.find(item => item.key === 'G');
            this.auxProtocolSelect.value = auxProtocolItem.value;
            this.enableAuxProtocolCheckbox.checked = true;
            this.auxProtocolSelect.disabled = false;
        } else {
            this.enableAuxProtocolCheckbox.checked = false;
            this.auxProtocolSelect.disabled = true;
        }

        // AUXポートビットレート
        if (config.find(item => item.key === 'H')) {
            const auxBaudrateItem = config.find(item => item.key === 'H');
            this.auxBaudrateSelect.value = auxBaudrateItem.value;
            this.enableAuxBaudrateCheckbox.checked = true;
            this.auxBaudrateSelect.disabled = false;
        } else {
            this.enableAuxBaudrateCheckbox.checked = false;
            this.auxBaudrateSelect.disabled = true;
        }

        // AUXポート出力レート
        if (config.find(item => item.key === 'I')) {
            const auxOutputRateItem = config.find(item => item.key === 'I');
            this.auxOutputRateSelect.value = auxOutputRateItem.value;
            this.enableAuxOutputRateCheckbox.checked = true;
            this.auxOutputRateSelect.disabled = false;
        } else {
            this.enableAuxOutputRateCheckbox.checked = false;
            this.auxOutputRateSelect.disabled = true;
        }

        // M5Bポートプロトコル
        if (config.find(item => item.key === 'J')) {
            const m5bProtocolItem = config.find(item => item.key === 'J');
            this.m5bProtocolSelect.value = m5bProtocolItem.value;
            this.enableM5bProtocolCheckbox.checked = true;
            this.m5bProtocolSelect.disabled = false;
        } else {
            this.enableM5bProtocolCheckbox.checked = false;
            this.m5bProtocolSelect.disabled = true;
        }

        // M5Bポートビットレート
        if (config.find(item => item.key === 'K')) {
            const m5bBaudrateItem = config.find(item => item.key === 'K');
            this.m5bBaudrateSelect.value = m5bBaudrateItem.value;
            this.enableM5bBaudrateCheckbox.checked = true;
            this.m5bBaudrateSelect.disabled = false;
        } else {
            this.enableM5bBaudrateCheckbox.checked = false;
            this.m5bBaudrateSelect.disabled = true;
        }

        // M5Bポート出力レート
        if (config.find(item => item.key === 'M')) {
            const m5bOutputRateItem = config.find(item => item.key === 'M');
            this.m5bOutputRateSelect.value = m5bOutputRateItem.value;
            this.enableM5bOutputRateCheckbox.checked = true;
            this.m5bOutputRateSelect.disabled = false;
        } else {
            this.enableM5bOutputRateCheckbox.checked = false;
            this.m5bOutputRateSelect.disabled = true;
        }

        // 平均化サイクル
        if (config.find(item => item.key === 'N')) {
            const averagingCycleItem = config.find(item => item.key === 'N');
            this.averagingCycleSelect.value = averagingCycleItem.value;
            this.enableAveragingCycleCheckbox.checked = true;
            this.averagingCycleSelect.disabled = false;
        } else {
            this.enableAveragingCycleCheckbox.checked = false;
            this.averagingCycleSelect.disabled = true;
        }

        // 送信ボタンの有効性を再評価
        this.updateSendButtonAvailability();
    }
}
