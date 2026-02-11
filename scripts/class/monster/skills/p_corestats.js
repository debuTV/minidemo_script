import { Monster } from "../monster";
import { SkillTemplate } from "../skill_manager";

export class CoreStats extends SkillTemplate {
    /**
     * @param {Monster} monster 
     * @param {{ 
     * health_mult: number,health_value:number; 
     * damage_mult: number,damage_value:number; 
     * speed_mult: number,speed_value:number;  
     * reward_mult: number,reward_value:number; 
     * }} params
     */
    constructor(monster,params) {
        super(monster);
        this.id = "CoreStats";
        this.type="Passive";
        this.params = params;
    }

    onAdd() {
        if(this.params.health_value)this.monster.health=this.monster.maxhealth +=this.params.health_value;
        if(this.params.health_mult)this.monster.health=this.monster.maxhealth *=this.params.health_mult;
        if(this.monster.maxhealth<=0)this.monster.health=this.monster.maxhealth=1;

        if(this.params.damage_value)this.monster.damage+=this.params.damage_value;
        if(this.params.damage_mult)this.monster.damage*=this.params.damage_mult;
        if(this.monster.damage<0)this.monster.damage=0;

        if(this.params.speed_value)this.monster.speed+=this.params.speed_value;
        if(this.params.speed_mult)this.monster.speed*=this.params.speed_mult;
        if(this.monster.speed<0)this.monster.speed=0;

        if(this.params.reward_value)this.monster.baseReward+=this.params.reward_value;
        if(this.params.reward_mult)this.monster.baseReward*=this.params.reward_mult;
        if(this.monster.baseReward<0)this.monster.baseReward=0;
    }
}