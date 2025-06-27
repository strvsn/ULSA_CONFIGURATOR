/**
 * コンソール表示管理クラス
 * 受信データの表示、送信ログ、コンソール操作を管理
 */
class ConsoleManager {
    constructor(consoleElement) {
        this.console = consoleElement;
        this.autoscroll = true;
        this.showTimestamp = true;
        this.scrollTimer = null;
        this.currentReceiveLine = null;
        
        // UI要素の初期化
        this.initializeUIElements();
        this.attachEventListeners();
    }

    initializeUIElements() {
        this.clearConsoleBtn = document.getElementById('clearConsoleBtn');
        this.autoscrollBtn = document.getElementById('autoscrollBtn');
        this.timestampBtn = document.getElementById('timestampBtn');
    }

    attachEventListeners() {
        this.clearConsoleBtn.addEventListener('click', () => this.clearConsole());
        this.autoscrollBtn.addEventListener('click', () => this.toggleAutoscroll());
        this.timestampBtn.addEventListener('click', () => this.toggleTimestamp());
    }

    /**
     * 受信文字を現在の行に追加
     */
    addToCurrentReceiveLine(char) {
        if (!this.currentReceiveLine) {
            this.currentReceiveLine = this.createReceiveLineElement();
        }
        this.currentReceiveLine.textContent += char;
        // 親ページのスクロール振動対策
        if (!this.autoscroll) {
            const pageScrollY = window.scrollY;
            this.autoScroll();
            window.scrollTo(window.scrollX, pageScrollY);
        } else {
            this.autoScroll();
        }
    }

    /**
     * 新しい受信行要素を作成
     */
    createReceiveLineElement() {
        this.limitMessages();

        const messageElement = document.createElement('div');
        messageElement.className = 'console-message received';
        
        let content = '';
        if (this.showTimestamp) {
            const now = new Date();
            const milliseconds = Math.floor(now.getMilliseconds() / 100);
            content += `[${now.toTimeString().substring(0, 8)}.${milliseconds}] `;
        }
        content += '← ';
        
        messageElement.textContent = content;
        this.console.appendChild(messageElement);
        
        return messageElement;
    }

    /**
     * 現在の受信行を完了
     */
    finishReceiveLine() {
        this.currentReceiveLine = null;
    }

    /**
     * 改行文字を処理
     */
    handleLineBreak() {
        if (this.currentReceiveLine) {
            this.finishReceiveLine();
        }
    }

    /**
     * ログメッセージをコンソールに表示
     */
    logToConsole(type, message) {
        if (type === 'info') {
            return; // infoタイプのメッセージは表示しない
        }
        this.limitMessages();
        const messageElement = document.createElement('div');
        messageElement.className = `console-message ${type}`;
        let timestampText = '';
        if (this.showTimestamp) {
            const now = new Date();
            const milliseconds = Math.floor(now.getMilliseconds() / 100);
            timestampText = `[${now.toTimeString().substring(0, 8)}.${milliseconds}] `;
        }
        const prefix = this.getMessagePrefix(type);
        messageElement.textContent = timestampText + prefix + message;
        this.console.appendChild(messageElement);
        // 親ページのスクロール振動対策
        if (!this.autoscroll) {
            const pageScrollY = window.scrollY;
            this.autoScroll();
            window.scrollTo(window.scrollX, pageScrollY);
        } else {
            this.autoScroll();
        }
    }

    /**
     * メッセージタイプに応じたプレフィックスを取得
     */
    getMessagePrefix(type) {
        switch (type) {
            case 'sent': return '→ ';
            case 'received': return '← ';
            case 'error': return '❌ ';
            case 'info': return 'ℹ️ ';
            case 'success': return '✅ ';
            default: return '';
        }
    }

    /**
     * メッセージ数制限
     */
    limitMessages() {
        const maxMessages = 100;
        // スクロール位置保存
        const prevScrollTop = this.console.scrollTop;
        const prevScrollHeight = this.console.scrollHeight;
        const prevAtBottom = (this.console.scrollTop + this.console.clientHeight) >= (this.console.scrollHeight - 2);
        const prevWindowScrollY = window.scrollY;

        if (this.console.children.length >= maxMessages) {
            const toRemove = this.console.children.length - maxMessages + 1;
            for (let i = 0; i < toRemove; i++) {
                this.console.removeChild(this.console.firstChild);
            }
        }
        // スクロール位置復元（自動スクロールOFF時のみ）
        if (!this.autoscroll && !prevAtBottom) {
            const newScrollHeight = this.console.scrollHeight;
            this.console.scrollTop = Math.max(0, prevScrollTop - (prevScrollHeight - newScrollHeight));
        }
        // 親ページのスクロールも強制復元
        if (!this.autoscroll) {
            if (window.scrollY !== prevWindowScrollY) {
                window.scrollTo(window.scrollX, prevWindowScrollY);
            }
        }
    }

    /**
     * 自動スクロール
     */
    autoScroll() {
        if (this.autoscroll) {
            requestAnimationFrame(() => {
                this.console.scrollTop = this.console.scrollHeight;
            });
        }
    }

    /**
     * コンソールをクリア
     */
    clearConsole() {
        this.console.textContent = '';
        this.currentReceiveLine = null;
        this.logToConsole('info', 'コンソールをクリアしました');
    }

    /**
     * 自動スクロールの切り替え
     */
    toggleAutoscroll() {
        this.autoscroll = !this.autoscroll;
        this.autoscrollBtn.classList.toggle('active', this.autoscroll);
        
        if (this.autoscroll) {
            if (this.scrollTimer) {
                clearTimeout(this.scrollTimer);
            }
            this.scrollTimer = setTimeout(() => {
                this.console.scrollTop = this.console.scrollHeight;
            }, 100);
        }
    }

    /**
     * タイムスタンプ表示の切り替え
     */
    toggleTimestamp() {
        this.showTimestamp = !this.showTimestamp;
        this.timestampBtn.classList.toggle('active', this.showTimestamp);
    }

    /**
     * 受信行バッファをリセット
     */
    resetReceiveBuffer() {
        this.currentReceiveLine = null;
    }
}
