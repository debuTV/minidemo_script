import { Instance} from "cs_script/point_script";
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
        this.waves = [
            { 
                name: "训练波", 
                totalMonsters: 1000, 
                reward: 500, 
                spawnInterval: 3.0, 
                preparationTime: 15,
                monsterTypes:[
                    {
                        template_name:"headcrab_classic_template",
                        name: "Zombie",
                        baseHealth: 100,
                        baseDamage: 10,
                        speed: 150,
                        reward: 100,
                        attackdist:80,
                        movementmode:"OnGround",
                        skill_pool:[
                            //{
                            //    id:"pounce",//技能名称
                            //    chance: 1,//技能获得概率
                            //    params:{cooldowntime:5,distance:250,animation:"pounce"}
                            //},
                            //{
                            //    id:"speed_boost",//技能名称
                            //    chance: 0,//技能获得概率
                            //    params:{multiplier:1.3}
                            //},
                            //{
                            //    id: "hp_up",
                            //    chance: 0,
                            //    params: { value: 50 }
                            //},
                            //{
                            //    id: "shield",
                            //    chance: 0,
                            //    params: {cooldowntime:15,runtime:-1,value:50}
                            //}
                        ],
                        animations:{
                            "idle":[
                                "headcrab_classic_idle",
                                "headcrab_classic_idle_b",
                                "headcrab_classic_idle_c"
                            ],
                            "walk":[
                                "headcrab_classic_walk",
                                "headcrab_classic_run"
                            ],
                            "attack":[
                                "headcrab_classic_attack_antic_02",
                                "headcrab_classic_attack_antic_03",
                                "headcrab_classic_attack_antic_04"
                            ],
                            "skill":[
                                "headcrab_classic_attack_antic_02",
                                "headcrab_classic_attack_antic_03",
                                "headcrab_classic_attack_antic_04"
                            ],
                            "pounce":[
                                "headcrab_classic_jumpattack"
                            ]
                        }
                    }
                ]
            },
            //{ name: "实战波", totalMonsters: 1, reward: 800, spawnInterval: 2.5, preparationTime: 10,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100}] },
            //{ name: "挑战波", totalMonsters: 1, reward: 1200, spawnInterval: 2.0, preparationTime: 10,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100}] },
            //{ name: "精英波", totalMonsters: 1, reward: 1800, spawnInterval: 1.8, preparationTime: 10,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100}] },
            //{ name: "生存波", totalMonsters: 1, reward: 2500, spawnInterval: 1.5, preparationTime: 8,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100}]},
            //{ name: "地狱波", totalMonsters: 1, reward: 3500, spawnInterval: 1.2, preparationTime: 5,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100}] },
            //{ name: "终极波", totalMonsters: 1, reward: 5000, spawnInterval: 1.0, preparationTime: 5,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100}] },
            //{ name: "无尽波", totalMonsters: 1, reward: 7000, spawnInterval: 0.8, preparationTime: 5,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100}] },
            { name: "最终波", totalMonsters: 1, reward: 10000, spawnInterval: 0, preparationTime: 10,monsterTypes:[{name: "Zombie",baseHealth: 100,baseDamage: 10,speed: 250,reward: 100,attackdist:80}] }
        ];
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
        
        /////////////////////////////////////////////////////////////
        
        Instance.Msg(`=== 第 ${waveNumber} 波开始===`);

        // 触发回调
        if (this.onWaveStart) {
            this.onWaveStart(this.currentWave, wave);
        }
        
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
    /**
     * @param {number} nowtime
     */
    tick(nowtime)
    {
        
    }
}