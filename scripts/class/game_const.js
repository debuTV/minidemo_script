//待更新
//1.怪物跳跃调参
//2.产卵技能
//·······
//3.玩家毒气debuff

//===================游戏参数========================
// true为线性游戏，!r准备，第一波结束，开启第二波，一直到最后；
// false为观赏模式（ZE模式），没有准备选项，并关闭脚本玩家管理器，通过外部OnScriptInput触发指定波次，再通过OnScriptInput可以强制结束指定波次，波次结束后不会触发下一波
export const linearGame=false;
export const targetTeam=5;      //怪物选取目标范围 t:2,ct:3  t+ct:5
export const playerDamage=true; //当处于观赏模式时，玩家是否可以受到怪物伤害，直接造成伤害，不对伤害进行修改
export const clearbyRound=true; //是否在新回合开始或结束时重置脚本，观赏模式（ZE模式）推荐开启
//==================怪物移动相关设置================
export const alternatMode=true  //交替移动模式，第一个tick一半怪物移动，第二个tick另一半移动，能让地图支持更多怪物
export const gravity=800;       //世界重力
export const friction=6;        //摩擦力参数
export const stepHeight=13;     //怪物爬台阶高度，尽量和navmesh中一致
export const goalTolerance=8;   //路径切换距离
export const arriveDistance=1;  //距离最后一个导航点这个距离后，怪物不会再前进
export const moveEpsilon=0.5;   //移动小于这个距离，认为怪物没动
export const timeThreshold=2;   //等待多久后，认为怪物没动卡死

//怪物移动时候的碰撞盒子，设置过大容易过不去门，设置过小容易造成怪物钻进墙里的错觉
export const Tracemins={x:-4,y:-4,z:1};
export const Tracemaxs={x:4,y:4,z:4};
export const groundCheckDist=8;//找地面时向下找多远
export const surfaceEpsilon=4;//每次移动离碰撞面多远
//===================波次参数========================
export const wavesConfig=[
        { 
            name: "训练波", 
            totalMonsters: 1000, 
            reward: 500, 
            spawnInterval: 3.0, 
            preparationTime: 0, //波次开始到第一个怪物出现时间
            aliveMonster:2, //同时存在的怪物数量
            monster_spawn_points_name:["",""],//这一波生成点
            monster_breakablemins:{x:-30,y:-30,z:0},//最大怪物的breakable的mins
            monster_breakablemaxs:{x:30,y:30,z:75},//最大怪物的breakable的maxs
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
    ];