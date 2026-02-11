import { Instance } from "cs_script/point_script";
import { Monster } from "./monster";

/*
事件大全

//当受到伤害后(伤害值，最后血量)
OntakeDamage(value,health)

//怪物死亡前，这时候实体还未销毁
OnDie()

//当前TICK(tick间隔，所有怪物breakable实体)
OnTick(dt,allmpos)

//目标更新后
OnupdateTarget()

//没有攻击到目标
OnattackFalse()

//对目标造成伤害后
OnattackTrue()
 */
export class SkillTemplate
{
    /**
     * @param {Monster} monster
     */
    constructor(monster) {
        this.monster=monster;
        this.id = "unknown";
        this.type="null";
        // 冷却（秒）
        this.cooldown = 0;
        this.lastTriggerTime = -999;
        this.running=false;
    }
    /**
     * 能力被添加到怪物时调用
     */
    onAdd() {}

    /**
     * 这个事件能否执行，有些被动技能在这里直接执行，然后返回false，例如护盾，一类的需要实时的
     * @param {any} event
     */
    canTrigger(event) {
        return false;
    }
    /**
     * 请求执行
     */
    request(){}
    /**
     * 执行skill
     */
    trigger() {}
    //对于后台限时技能的执行
    /**
     */
    tick(){}
    _cooldownReady() {
        if (this.cooldown <= 0) return true;
        const now = Instance.GetGameTime();
        return now - this.lastTriggerTime >= this.cooldown;
    }

    _markTriggered() {
        this.lastTriggerTime = Instance.GetGameTime();
    }
}