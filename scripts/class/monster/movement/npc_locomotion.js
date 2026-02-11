import { AIMotor } from "./ai_motor";
import { PathFollower } from "./path_cursor";
import { Entity, Instance } from "cs_script/point_script";
import { MovementController } from "./movement_controller";
import { Monster } from "../monster";
import { vec } from "../../util/vector";
export const PathState = {
    WALK: 1,//下一个点直走
    JUMP: 2,//下一个点需要跳跃
};
export class NPCLocomotion {
    /**
     * @param {Entity} entity
     * @param {Monster} monster
     */
    constructor(monster,entity) {
        this.monster=monster;
        this.entity = entity;
        // 核心组件
        this.motor = new AIMotor(entity);
        this.pathFollower = new PathFollower();

        // 输入（由 AI / Path 决定）
        this.wishDir = vec.get(0,0,0);
        this.wishSpeed = 0;
        
        //基础属性
        this.maxSpeed = 120;       // 怪物速度
        this.arriveDistance = 15;   // 接近目标后认为“到达”,要比攻击距离远

        // 状态缓存
        this._isStopped = true;

        this.controller = new MovementController(this);
        this.controller.setMode("walk");
    }
    getposV3()
    {
        return vec.clone(this.entity.GetAbsOrigin());
    }
    /**
     * 设置一条导航路径
     * @param {{ pos: import("cs_script/point_script").Vector; mode: number; }[]} path
     */
    setPath(path) {
        this.pathFollower.setPath(path);
    }
    resume()
    {
        this._isStopped = false;
    }
    /**
     * 强制停止（例如攻击 / 撞击）
     */
    stop() {
        this.wishDir=vec.get(0,0,0);
        this.wishSpeed = 0;
        this.motor.stop();
        this._isStopped = true;
    }
    /**
     * 每帧更新（唯一入口）
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(dt,mpos) {
        this.maxSpeed=this.monster.speed;
        this.arriveDistance=Math.max(1,this.monster.attackdist-5);
        if (this._isStopped) return;
        this.controller.update(dt, mpos);
    }

    /**
     * 计算期望方向与速度
     * 这是 Source 里非常“干净”的一层
     * 得到
     * 一个 wishDir（2D 方向）
     * 一个 wishSpeed（理想速度）
     * @param {{pos: import("cs_script/point_script").Vector; mode: number;}|null} goalPos
     */
    _computeWish(goalPos) {
        if(!goalPos)
        {
            this.wishDir=vec.get(0,0,0);
            this.wishSpeed = this.maxSpeed;
            return;
        }
        const pos = this.getposV3();

        const toGoal = vec.sub(goalPos.pos,pos);
        const dist = vec.length(toGoal);
        if(goalPos.mode==PathState.JUMP)
        {
            //暂定========================================
            // 已经非常接近 → 停止
            if (dist <= 4) {
                this.wishDir=vec.get(0,0,0);
                this.wishSpeed = this.maxSpeed;
                return;
            }
            this.wishDir=vec.normalize(toGoal);
            this.wishSpeed = this.maxSpeed*3;
        }
        else
        {
            // 已经非常接近 → 停止
            if (dist <= this.arriveDistance) {
                this.wishDir=vec.get(0,0,0);
                this.wishSpeed = this.maxSpeed;
                return;
            }

            // 2d方向
            this.wishDir=vec.normalize2D(toGoal);

            // Source 风格：不在 Locomotion 里搞复杂加速曲线
            this.wishSpeed = this.maxSpeed;
        }
    }

    // 当前是否在地面
    isOnGround() {
        return this.motor.isOnGround();
    }
    // 当前速度
    getVelocity() {
        return this.motor.getVelocity();
    }
    //是否正在移动
    isMoving() {
        return !this._isStopped && this.wishSpeed > 0;
    }
}
