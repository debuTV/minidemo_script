import { Instance} from "cs_script/point_script";
import { wavesConfig } from "./game_const";
export class WaveManager {
    /**
     * @returns
     */
    constructor() {
        /** @type {number} */
        this.currentWave = 0;
        /** @type {string} */
        this.waveState = 'IDLE'; // IDLE, ACTIVE, COMPLETED
        /**
         * @type {any[]}
         */
        this.waves = []; // 波次配置数组
        this.onWaveComplete = null; // 波次完成回调
        this.onWaveStart = null; // 波次开始回调
        this.initDefaultWaves();

        this.wavepretick=-1;         //波次激活时间
        this.wavetime=0;             //波次激活到开始的时间
        this.waveenable=false;       //波次是否激活
    }
    // 设置回调
    /**
     * @param {(waveNumber: any, waveConfig: any) => void} callback
     */
    setOnWaveComplete(callback) {
        this.onWaveComplete = callback;
    }
    
    /**
     * @param {(waveNumber: any, waveConfig: any) => void} callback
     */
    setOnWaveStart(callback) {
        this.onWaveStart = callback;
    }
    // 初始化波次配置
    initDefaultWaves() {
        // 每波配置: { name, totalMonsters, reward, spawnInterval, preparationTime }
        this.waves = wavesConfig;
    }
    // 开始指定波次
    /**
     * @param {number} waveNumber
     */
    startWave(waveNumber) {
        if (this.waveState === 'ACTIVE') {
            Instance.Msg(`无法开始波次 ${waveNumber}，当前波次进行中`);
            return false;
        }
        
        if (waveNumber < 1 || waveNumber > this.waves.length) {
            Instance.Msg(`波次 ${waveNumber} 超出范围 (1-${this.waves.length})`);
            return false;
        }
        
        this.currentWave = waveNumber;
        this.waveState = 'ACTIVE';

        const wave = this.getCurrentWave();
        // 广播波次开始
        this.broadcastWaveStart(wave);
        
        this.wavepretick=Instance.GetGameTime();
        this.wavetime=wave.preparationTime;
        this.waveenable=true;

        return true;
    }
    // 获取当前波次信息
    getCurrentWave() {
        if (this.currentWave < 1 || this.currentWave > this.waves.length) {
            return null;
        }
        return this.waves[this.currentWave - 1];
    }
    // 获取下一波信息
    getNextWave() {
        const nextWave = this.currentWave + 1;
        if (nextWave > this.waves.length) {
            return null;
        }
        return this.waves[nextWave - 1];
    }
    // 是否有下一波
    hasNextWave() {
        return this.currentWave < this.waves.length;
    }
    
    // 获取总波次数
    getTotalWaves() {
        return this.waves.length;
    }
    
    // 获取波次进度
    getProgress() {
        return {
            current: this.currentWave,
            total: this.waves.length,
            state: this.waveState,
            wave: this.getCurrentWave()
        };
    }
    // 开始下一波
    nextWave() {
        if (this.currentWave >= this.waves.length) {
            Instance.Msg("所有波次已完成！");
            return false;
        }
        
        return this.startWave(this.currentWave + 1);
    }
    // 波次完成（由外部调用，例如怪物管理器）
    completeWave() {
        if (this.waveState !== 'ACTIVE') return false;
        
        this.waveState = 'COMPLETED';
        const wave = this.getCurrentWave();
        
        // 广播波次完成
        this.broadcastWaveComplete(wave);
        
        Instance.Msg(`第 ${this.currentWave} 波完成！奖励: $${wave?.reward??0}`);
        // 触发回调
        if (this.onWaveComplete) {
            this.onWaveComplete(this.currentWave, wave);
        }
        return true;
    }
    // 广播波次开始
    /**
     * @param {{ name: string; totalMonsters: number; reward: number; spawnInterval: number; preparationTime: number; monsterTypes: { name: string; baseHealth: number; baseDamage: number; speed: number; reward: number; }[]; } | null} wave
     */
    broadcastWaveStart(wave) {
        const message = `=== 第 ${this.currentWave} 波: ${wave?.name??-1} ===\n` +
                       `怪物总数: ${wave?.totalMonsters??-1}\n` +
                       `奖励: $${wave?.reward??-1}\n` +
                       `准备时间: ${wave?.preparationTime??-1} 秒`;
        this.broadcastMessage(message);
    }
    
    // 广播波次完成

    /**
     * @param {{ name: string; totalMonsters: number; reward: number; spawnInterval: number; preparationTime: number; monsterTypes: { name: string; baseHealth: number; baseDamage: number; speed: number; reward: number; }[]; } | null} wave
     */
    broadcastWaveComplete(wave) {
        const nextWave = this.getNextWave();
        let message = `=== 第 ${this.currentWave} 波完成 ===\n` +
                     `奖励: $${wave?.reward??-1}`;
        
        if (nextWave) {
            message += `\n下一波: ${nextWave.name} (${nextWave.totalMonsters} 怪物)`;
        } else {
            message += "\n=== 所有波次完成 ===";
        }
        
        this.broadcastMessage(message);
    }
    // 辅助方法
    /**
     * @param {string} message
     */
    broadcastMessage(message) {
        Instance.Msg(`[WaveManager] ${message}`);
        //Instance.ServerCommand(`say ${message}`);
    }

    // 重置波次
    resetGame() {
        this.currentWave = 0;
        this.waveState = 'IDLE';
        Instance.Msg("波次已重置");
    }
    
    tick()
    {
        if(this.waveenable)
        {
            const now=Instance.GetGameTime();
            if(now-this.wavepretick>=this.wavetime)
            {
                Instance.Msg(`=== 第 ${this.currentWave} 波开始===`);

                // 触发回调
                if (this.onWaveStart) {
                    this.onWaveStart(this.currentWave, this.getCurrentWave());
                }
            }
            this.waveenable=false;
        }
    }
}