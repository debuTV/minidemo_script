import { CSPlayerPawn, Entity, Instance} from "cs_script/point_script";
import { Monster, MonsterState } from "./monster/monster";
import { NavMesh } from "./monster/navmesh/path_manager";
export class MonsterManager {
    constructor() {
        /** @type {Map<number,Monster>} */
        this.monsters = new Map();
        /** @type {number} */
        this.nextMonsterId = 1;
        /** @type {number} */
        this.activeMonsters = 0; // 当前活跃怪物数量
        /** @type {number} */
        this.totalKills = 0; // 总击杀数
        /** @type {number} */
        this.totalReward = 0; // 总奖励
        this.totaltick=-1;
        // 事件回调
        this.onMonsterSpawn = null; // 怪物生成回调
        this.onMonsterDeath = null; // 怪物死亡回调
        this.onAllMonstersDead = null; // 所有怪物死亡回调
        this.onAttack=null;//怪物攻击回调
        this.onSkill=null;//怪物技能回调
        /** @type {NavMesh} */
        this.pathfinder=new NavMesh();
        this.pathfinder.init();
        this.pathfinder.debug();
        this.pathlist=new MinHeap(1000);
        this.pretick=-1;

        this.spawnpretick=-1;        //上一个怪物什么时候生成的
        this.spawnmonstercount=0;    //生成了多少个怪物了
        this.spawn=false;            //是否启用生成怪物
        this.spawnconfig=null;       //生成的config
    }
    // 生成一批怪物
    /**
     * @param {null|{name:string,totalMonsters:number,reward:number,spawnInterval:number,preparationTime:number,monsterTypes:{name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]}} waveConfig
     */
    spawnWave(waveConfig) {
        if (!waveConfig || waveConfig.totalMonsters <= 0) return;
        this.spawnpretick=-1;
        this.spawnmonstercount=0;
        this.spawn=true;
        this.spawnconfig=waveConfig;
    }
    // 停止生成怪物
    stopWave()
    {
        this.spawn=false;
    }
    // 生成单个怪物
    /**
     * @param {{name:string,totalMonsters:number,reward:number,spawnInterval:number,preparationTime:number,monsterTypes:{name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]}} waveConfig
     */
    spawnMonster(waveConfig) {
        try {
            // 获取生成点
            const spawnPointNames = waveConfig.monster_spawn_points_name;
            /**@type {Entity[]} */
            const spawnPoints =[];
            spawnPointNames.forEach(e => {
                const i=Instance.FindEntitiesByName(e);
                spawnPoints.push(...i);
            });
            if (spawnPoints.length === 0) {
                Instance.Msg("错误: 未找到怪物生成点");
                return null;
            }
            
            // 随机选择生成点
            const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            const pos=spawnPoint.GetAbsOrigin();
            const mins={x:-30,y:-30,z:-30};
            const maxs={x:30,y:30,z:30};//整个breakable大小20*20*40
            const start={ x: pos.x, y: pos.y, z: pos.z+ 45};
            const end={ x: pos.x, y:pos.y, z: pos.z+ 50};
            //检查周围是否遮挡
            if(Instance.TraceBox({ mins, maxs,start,end, ignorePlayers: true }).hitEntity)
            {
                Instance.Msg("错误: 生成点有遮挡");
                return null;
            }
            // 创建怪物ID
            const monsterId = this.nextMonsterId++;
            
            // 创建怪物实例
            // 这里调用 Monster 类的构造函数
            // 参数包括：ID, 位置, 朝向, 怪物类型, 波次配置
            
            const monster = new Monster(
                monsterId,
                end,
                this.getMonsterType(waveConfig, monsterId),
                this.pathfinder
            );
            // 设置怪物死亡回调
            monster.setOnDeath((monsterInstance, killer) => {
                this.handleMonsterDeath(monsterInstance, killer);
            });
            monster.setOnAttack((damage, target)=>{
                if(this.onAttack)this.onAttack(damage, target);
            });
            monster.setOnSkill((id,target)=>{
                if(this.onSkill)this.onSkill(id,target);
            });
            // 存储怪物
            this.monsters.set(monsterId, monster);
            this.activeMonsters++;
            this.pathlist.push(monsterId,-1);

            // 触发生成回调
            if (this.onMonsterSpawn) {
                this.onMonsterSpawn(monster);
            }
            
            Instance.Msg(`生成怪物 #${monsterId} ${monster.type} HP:${monster.health}`);
            
            return monster;
            
        } catch (error) {
            Instance.Msg(`生成怪物失败: ${error}`);
            return null;
        }
    }
    // 处理怪物死亡
    /**
     * @param {Monster} monsterInstance
     * @param {import("cs_script/point_script").Entity|null|undefined} killer
     */
    handleMonsterDeath(monsterInstance, killer) {
        const monsterId = monsterInstance.id;
        
        // 记录击杀
        this.activeMonsters--;
        this.totalKills++;
        
        // 计算并发放奖励
        const reward = monsterInstance.baseReward;
        this.totalReward += reward;
        
        // 从地图中移除
        this.monsters.delete(monsterId);
        
        // 触发死亡回调
        if (this.onMonsterDeath) {
            this.onMonsterDeath(monsterInstance, killer, reward);
        }
        
        // 检查是否所有怪物都死亡了
        if (this.activeMonsters <= 0&&this.spawn==false) {
            this.triggerAllMonstersDead();
        }
        
        Instance.Msg(`怪物 #${monsterId} 死亡，奖励: ${reward}`);
    }
    /**
     * 清理所有怪物
     */
    cleanup() {
        // 调用每个怪物的清理方法
        for (const [id, monster] of this.monsters) {
            try {
                monster.die(null);
            } catch (error) {
                Instance.Msg(`清理怪物 #${id} 失败: ${error}`);
            }
        }
        
        // 清空管理器
        this.monsters.clear();
        this.activeMonsters = 0;
        this.pathlist.clear();

        Instance.Msg("所有怪物已清理");
    }
    // 强制杀死所有怪物
    killAllMonsters() {
        const killed = [];
        
        for (const [id, monster] of this.monsters) {
            try {
                monster.die(null);
                killed.push(id);
            } catch (error) {
                Instance.Msg(`杀死怪物 #${id} 失败: ${error}`);
            }
        }
        
        Instance.Msg(`强制杀死 ${killed.length} 个怪物`);
        return killed;
    }

    tick()
    {
        this.totaltick++;
        const now=Instance.GetGameTime();
        //每次更新一个怪物的路径。
        let first=-1;
        while (!this.pathlist.isEmpty()) 
        {
            const current = this.pathlist.pop();
            if(current.node==first||now-current.cost<=0.5)//不能更新太勤快，不然怪物在悬崖边旋转
            {
                this.pathlist.push(current.node, current.cost);
                break;//循环了说是，或者更新太快
            }
            if(first==-1)first=current.node;
            if(this.monsters.has(current.node))
            {
                const ms=this.monsters.get(current.node);
                if(!ms)continue;
                this.pathlist.push(current.node, Instance.GetGameTime());
                if(ms.updatepath())break;
            }
        }
        const allmpos=this.getActiveMonsters().map(function(item){
            return item.breakable;
        });
        for (const [id, monster] of this.monsters) {
            try {
                if(this.totaltick%2==id%2)monster.tick(allmpos);
            } catch (error) {
                Instance.Msg(`更新怪物 #${id} 失败: ${error}`);
            }
        }
        if(this.spawn==true)
        {
            if(!this.spawnconfig)return;
            if(this.spawnmonstercount>=this.spawnconfig.totalMonsters)
            {
                this.spawn=false;
                return;
            }
            if(now-this.spawnpretick>=this.spawnconfig.spawnInterval)///////生成间隔
            {
                //根据人数设置同一时间僵尸个数
                if(this.activeMonsters>=this.spawnconfig.aliveMonster)return;///////生成个数
                if(this.spawnmonstercount<this.spawnconfig.totalMonsters)
                {
                    let monster = this.spawnMonster(this.spawnconfig);
                    if(monster)
                    {
                        this.spawnmonstercount++;
                        this.spawnpretick=now;
                    }
                }
            }
        }
    }
    // 获取怪物类型（根据波次配置和ID）
    /**
     * @param {{ totalMonsters?: number; monsterTypes?: {name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]; }} waveConfig
     * @param {number} monsterId
     */
    getMonsterType(waveConfig, monsterId) {
        // 如果有多种怪物类型，根据波次配置分配
        if (waveConfig.monsterTypes && waveConfig.monsterTypes.length > 0) {
            // 简单轮询分配类型
            const typeIndex = monsterId % waveConfig.monsterTypes.length;
            return waveConfig.monsterTypes[typeIndex];
        }
        
        // 默认怪物类型
        return {
            name: "Zombie",
            baseHealth: 100,
            baseDamage: 10,
            speed: 250,
            reward: 100,
        };
    }
    // 通过ID获取怪物
    /**
     * @param {number} id
     */
    getMonsterById(id) {
        return this.monsters.get(id);
    }
    
    // 获取所有怪物
    getAllMonsters() {
        return Array.from(this.monsters.values());
    }
    
    // 获取活跃怪物列表
    getActiveMonsters() {
        return Array.from(this.monsters.values()).filter(monster => monster.state!=MonsterState.DEAD);
    }
    
    // 获取所有怪物的ID
    getAllMonsterIds() {
        return Array.from(this.monsters.keys());
    }
    
    // 获取怪物数量
    getMonsterCount() {
        return this.activeMonsters;
    }
    
    // 获取总击杀数
    getTotalKills() {
        return this.totalKills;
    }
    
    // 获取总奖励
    getTotalReward() {
        return this.totalReward;
    }
    
    // 重置统计数据
    resetStats() {
        this.totalKills = 0;
        this.totalReward = 0;
    }
    // 触发所有怪物死亡事件
    triggerAllMonstersDead() {
        if (this.onAllMonstersDead) {
            this.onAllMonstersDead(this.totalKills, this.totalReward);
        }
    }
    
    // 设置事件回调
    /**
     * @param {(monster: Monster) => void} callback
     */
    setOnMonsterSpawn(callback) {
        this.onMonsterSpawn = callback;
    }
    
    /**
     * @param {(monster: Monster, killer: Entity|null|undefined, reward: number) => void} callback
     */
    setOnMonsterDeath(callback) {
        this.onMonsterDeath = callback;
    }
    
    /**
     * @param {(totalKills: number, totalReward: number) => void} callback
     */
    setOnAllMonstersDead(callback) {
        this.onAllMonstersDead = callback;
    }
    /**
     * @param {(damage: number, target: CSPlayerPawn) => void} callback
     */
    setOnAttack(callback) {
        this.onAttack = callback;
    }
    // 设置技能回调，就是给玩家加buff
    /**
     * @param {(id: string, target: CSPlayerPawn) => void} callback
     */
    setOnSkill(callback) {
        this.onSkill = callback;
    }
    // 获取管理器状态
    getStatus() {
        return {
            totalMonsters: this.monsters.size,
            activeMonsters: this.activeMonsters,
            nextId: this.nextMonsterId,
            totalKills: this.totalKills,
            totalReward: this.totalReward
        };
    }
}
class MinHeap {
    /**
     * @param {number} polyCount
     */
    constructor(polyCount) {
        this.nodes = new Int32Array(polyCount);
        this.costs = new Float32Array(polyCount);
        this.index = new Int32Array(polyCount).fill(-1);
        this.size = 0;
    }
    clear() {
        this.index.fill(-1);
        this.size = 0;
    }
    isEmpty() {
        return this.size === 0;
    }

    /**
     * @param {number} node
     * @param {number} cost
     */
    push(node, cost) {
        let i = this.size++;
        this.nodes[i] = node;
        this.costs[i] = cost;
        this.index[node] = i;
        this._up(i);
    }

    pop() {
        if (this.size === 0) return {node:-1,cost:-1};
        const topNode = this.nodes[0];
        const topcost= this.costs[0];
        this.index[topNode] = -1;
        this.size--;
        if (this.size > 0) {
            this.nodes[0] = this.nodes[this.size];
            this.costs[0] = this.costs[this.size];
            this.index[this.nodes[0]] = 0;
            this._down(0);
        }
        return {node:topNode,cost:topcost};
    }

    /**
     * @param {number} node
     * @param {number} cost
     */
    update(node, cost) {
        const i = this.index[node];
        if (i == null) return;
        this.costs[i] = cost;
        this._up(i);
    }

    /**
     * @param {number} i
     */
    _up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.costs[p] <= this.costs[i]) break;
            this._swap(i, p);
            i = p;
        }
    }

    /**
     * @param {number} i
     */
    _down(i) {
        const n = this.size;
        while (true) {
            let l = i * 2 + 1;
            let r = l + 1;
            let m = i;

            if (l < n && this.costs[l] < this.costs[m]) m = l;
            if (r < n && this.costs[r] < this.costs[m]) m = r;
            if (m === i) break;

            this._swap(i, m);
            i = m;
        }
    }

    /**
     * @param {number} a
     * @param {number} b
     */
    _swap(a, b) {
        const ca = this.costs[a];
        const cb = this.costs[b];
        const na = this.nodes[a];
        const nb = this.nodes[b];
        this.costs[a] = cb;
        this.costs[b] = ca;
        this.nodes[a] = nb;
        this.nodes[b] = na;
        this.index[na] = b;
        this.index[nb] = a;
    }
}