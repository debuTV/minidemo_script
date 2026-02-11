import { CSPlayerPawn, Instance } from "cs_script/point_script";
import { WaveManager } from "./wave_manager";
import { MonsterManager } from "./monster_manager";
import { PlayerManager } from "./player_manager";
import { sleep,m_sleepList, tickCallback } from "./game_sleep";
// 游戏状态管理
export class PvEGameManager {
    constructor() {
        /** @type {string} */
        this.gameState = 'WAITING'; // WAITING, PREPARE, PLAYING, WON, LOST
        /** @type {PlayerManager} */
        this.PlayerManager = new PlayerManager();
        /** @type {WaveManager} */
        this.WaveManager=new WaveManager();
        /** @type {MonsterManager} */
        this.MonsterManager=new MonsterManager();
        // 波次开始事件
        this.WaveManager.setOnWaveStart((waveNumber, waveConfig) => {
            // 通知怪物管理器生成怪物
            this.MonsterManager.spawnWave(waveConfig);
        });
        
        // 波次完成事件
        this.WaveManager.setOnWaveComplete((waveNumber, waveConfig) => {
            // 给予玩家奖励
            this.PlayerManager.giveWaveReward(waveConfig?.reward??0);
            
            // 清理怪物管理器
            this.MonsterManager.cleanup();
            this.MonsterManager.resetStats();

            // 如果有下一波，准备开始
            if (this.WaveManager.hasNextWave()) {
                const work=new sleep(3);
                work.setonTime(()=>{
                    this.WaveManager.nextWave();
                })
                m_sleepList.add(work);
            } else {
                this.gameWon();
            }
        });
        // 怪物生成事件
        this.MonsterManager.setOnMonsterSpawn((monster) => {
            console.log(`怪物 #${monster.id} 已生成`);
        });
        
        // 怪物死亡事件
        this.MonsterManager.setOnMonsterDeath((monster, killer, reward) => {
            // 给予玩家奖励
            if(killer && killer instanceof CSPlayerPawn)
            {
                const controller=killer.GetPlayerController();
                if(controller)
                {
                    const playerSlot = controller.GetPlayerSlot();
                    this.PlayerManager.giveExp(playerSlot, reward,"击杀怪物");
                    this.PlayerManager.giveMoney(playerSlot, reward,"击杀怪物");
                }
            }
        });
        
        // 所有怪物死亡事件
        this.MonsterManager.setOnAllMonstersDead((totalKills, totalReward) => {
            // 通知WaveManager波次完成
            this.WaveManager.completeWave();
        });

        // 玩家死亡事件
        this.PlayerManager.setOnPlayerDeath((playerPawn) => {
            console.log(`玩家 ${playerPawn.GetPlayerController()?.GetPlayerName()} 死亡`);
            this.checkGameState();
        });
        
        // 玩家准备事件
        this.PlayerManager.setOnPlayerReady((playerData, isReady) => {
            // 如果所有玩家都准备好了，开始游戏
            if (this.PlayerManager.areAllPlayersReady()) {
                this.startGame();
            }
        });
        this.PlayerManager.setOnPlayerRespawn((player_data)=>{
            if(this.gameState=="WAITING")
            {
                this.enterPreparePhase();
            }
        })
        this.PlayerManager.setOnPlayerJoin((player_data)=>{
            if(this.gameState=="WAITING")
            {
                this.enterPreparePhase();
            }
        })
    }
    
    init() {
        this.PlayerManager.setupEventListeners();
        // 监听玩家断开连接
        //Instance.OnPlayerDisconnect((event) => {
        //    this.checkGameState();
        //});
        Instance.SetThink(() => {
            //this.tick();
            this.PlayerManager.tick(Instance.GetGameTime());
            //this.WaveManager.tick();
            m_sleepList.tick(Instance.GetGameTime());
            this.MonsterManager.tick();
            tickCallback();
            Instance.SetNextThink(Instance.GetGameTime()+1/64);
        });
        Instance.SetNextThink(Instance.GetGameTime()+1/64);

    }
    
    // 进入准备阶段
    enterPreparePhase() {
        this.gameState = 'PREPARE';
        this.PlayerManager.resetAllReadyStatus();
        this.broadcastMessage("=== 准备阶段开始 ===");
        this.broadcastMessage("输入 !r 或 !ready 准备");
        this.broadcastMessage(`等待玩家准备... (0/${this.PlayerManager.getPlayerStats().active})`);
    }
    
    // 开始游戏
    startGame() {
        if (this.gameState !== 'PREPARE') return;

        this.gameState = 'PLAYING';

        this.broadcastMessage("=== 游戏开始 ===");
        
        // 开始生成怪物（需要与地图实体配合）
        this.WaveManager.startWave(1);
        
        // 重置玩家状态
        this.PlayerManager.resetPlayerGameStatus();
    }
    // 3. 游戏胜利/失败判断
    checkGameState() {
        if (this.gameState !== 'PLAYING') return;
        
        // 检查是否所有玩家死亡
        if (this.PlayerManager.hasAlivePlayers() === false) {
            this.gameLost();
            return;
        }
    }
    
    // 游戏失败
    gameLost() {
        this.gameState = 'LOST';
        this.broadcastMessage("=== 游戏失败 ===");
        this.broadcastMessage("所有玩家阵亡！");
        
        //this.resetGame();
    }
    
    // 游戏胜利
    gameWon() {
        this.gameState = 'WON';
        this.broadcastMessage("=== 游戏胜利 ===");
        // 进入下一波或结束游戏
        //this.resetGame();
    }

    // 回合重置
    resetGame() {
        // 重置玩家状态
        this.PlayerManager.resetAllReadyStatus();
        this.PlayerManager.resetPlayerGameStatus();

        // 清除所有怪物
        this.WaveManager.resetGame();
        this.MonsterManager.cleanup();
        this.MonsterManager.resetStats();

        this.broadcastMessage("5秒后重置游戏...");
        Instance.ServerCommand("mp_restartgame 5");

        // 重置游戏状态
        this.gameState = 'WAITTING';
        
        // 返回准备阶段
        this.enterPreparePhase();
    }
    /**
     * @param {string} message
     */
    broadcastMessage(message) {
        Instance.Msg(message);
        //Instance.ServerCommand(`say ${message}`);
    }
    /**
     * @param {number} playerSlot
     * @param {string} message
     */
    sendMessageToPlayer(playerSlot, message) {
        const player = Instance.GetPlayerController(playerSlot);
        if (player) {
            Instance.Msg(message);
            //Instance.ClientCommand(playerSlot, `say ${message}`);
        }
    }
}