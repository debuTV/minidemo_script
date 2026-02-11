import { CSPlayerPawn, Entity, Instance, PointTemplate} from "cs_script/point_script";
import { Monster_Default_Move } from "./monster_default_move";
import { MonsterManager } from "./monster_manager";

export class Monster_Zombie_Model {
    /**
     * @param {MonsterManager} mm
     * @param {number} id
     * @param {import("cs_script/point_script").Vector} position
     * @param {{name: string;baseHealth: number;baseDamage: number;speed: number;reward: number;}} typeConfig
     * @param {number} maxhealth
     */
    constructor(mm,id, position, typeConfig,maxhealth) {
        /** @type {MonsterManager} */
        this.mm=mm;
        /** @type {number} */
        this.id = id;
        /** @type {import("cs_script/point_script").Vector} */
        this.position = position;
        /** @type {{name: string;baseHealth: number;baseDamage: number;speed: number;reward: number;}} */
        this.typeConfig = typeConfig;
        // 实体引用
        /** @type {Entity} */
        this.breakable;  // 可破坏实体，移动本体
        /** @type {Entity} */
        this.model;      // 模型实体
        this.stats=0;//0:idle,1:walk,2:attack

        this.OnDamage=null;//怪物受到伤害回调

        // 初始化实体
        this.initEntities();
        //怪物移动类，决定怪物如何移动
        /**@type {Monster_Default_Move} */
        this.move=new Monster_Default_Move(this.mm,this.breakable);

        this.breakable.SetHealth(maxhealth);
    }
    
    // 初始化所有实体
    initEntities() {
        const template = Instance.FindEntityByName(`monster_zombie_template`);
        if (template && template instanceof PointTemplate) {
            const spawned = template.ForceSpawn(this.position);
            if (spawned && spawned.length > 0) {
                spawned.forEach((element,i) => {
                    if(element.GetClassName()=="func_breakable")
                    {
                        this.breakable=element;
                    }
                    if(element.GetClassName()=="prop_dynamic")
                    {
                        this.model=element;
                    }
                });
                //this.breakable.Teleport({ position:this.position });
            }
        }
        if(this.breakable)
        {
            Instance.ConnectOutput(this.breakable,"OnHealthChanged",(e)=>{
                if(e.activator&&e.activator instanceof CSPlayerPawn)
                {
                    if(typeof e.value=="number")this.onTakeDamage(e.value,e.activator);
                }
            });
        }
        if(this.model)
        {
            Instance.ConnectOutput(this.model,"OnAnimationDone",(e)=>{
                if(this.stats==1)
                {
                    Instance.EntFireAtTarget({target:this.model,input:"SetAnimation",value:"run"});
                }
                else if(this.stats==2)
                {
                    this.stats=0;
                    //攻击完了,回到默认状态
                }
            });
        }
    }
    // 移动到目标位置
    /**
     * @param {import("cs_script/point_script").Vector} targetPosition
     */
    moveTo(targetPosition) {
        if(this.stats==1)
        {
            this.move.tick(targetPosition,this.stats);
        }
        else if(this.stats==2)
        {
            //攻击中不移动，更新下tick
            this.move.tick(targetPosition,this.stats);
            //this.move.lasttick=Instance.GetGameTime();   
        }
        else if(this.stats==0)
        {
            Instance.EntFireAtTarget({target:this.model,input:"SetAnimation",value:"run"});
            this.stats=1;
            this.move.tick(targetPosition,this.stats);
        }
        // 使用轨道系统或直接移动实体到目标位置
        // 这是移动的具体实现
    }
    
    // 获取当前位置
    getPosition() {
        // 从模型实体获取位置
        if (this.breakable && this.breakable.IsValid()) {
            return this.breakable.GetAbsOrigin();
        }
        return this.position;
    }
    
    // 获取主实体
    getEntity() {
        // 返回主实体（通常是breakable或model）
        return this.breakable;
    }
    
    // 受伤效果
    /**
     * @param {number} amount
     * @param {CSPlayerPawn | null} attacker
     */
    onTakeDamage(amount, attacker) {
        // 播放受伤特效、音效等
        if(this.OnDamage)
        {
            this.OnDamage(amount, attacker);
        }
    }
    
    // 死亡效果
    /**
     * @param {CSPlayerPawn | null} killer
     */
    onDeath(killer) {
        // 播放死亡动画、特效、音效
        // 触发实体死亡事件
    }
    
    // 攻击效果
    onAttack() {
        // 播放攻击动画、特效、音效
        //强制进入攻击状态
        if(this.stats==2)return;
        this.stats=2;
        Instance.EntFireAtTarget({target:this.model,input:"SetAnimation",value:"attack"});
    }
    
    // 移除所有实体
    remove() {
        // 清理所有创建的实体
        this.breakable.Remove();
        this.model.Remove();
    }

    /**
     * @param {(amount: number, attacker: CSPlayerPawn | null) => void} callback
     */
    setOnDamage(callback)
    {
        this.OnDamage=callback;
    }
}