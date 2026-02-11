import { Monster } from "../monster";
import { SkillTemplate } from "../skill_manager";

export class PoisonGasSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     */
    constructor(monster) {
        super(monster);
        this.id = "PoisonGas";
        this.type="Passive";
    }

    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(event.type!="OnDie")return false;
        if (!this.monster.target) return false;
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        //这里在当前位置放一个粒子特效，并给与进入玩家持续伤害
        return false;
    }
}