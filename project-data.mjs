// Confirmed client offers. Roles do not imply a headcount.
const LINEUP_VISUALS = Object.freeze({
  "solo": {
    "src": "assets/formats-solo.webp",
    "width": 1200,
    "height": 786,
    "alt": "Вокалист Богемы с гитарой",
    "caption": "Вокалист-гитарист Богемы"
  },
  "trio": {
    "src": "assets/formats-trio.webp",
    "width": 1200,
    "height": 892,
    "alt": "Вокалист и вокалистка Богемы",
    "caption": "Вокалисты группы · общий образ"
  },
  "optimal": {
    "src": "assets/hero.webp",
    "width": 2000,
    "height": 1165,
    "alt": "Пять участников группы Богема",
    "caption": "На фото — группа Богема"
  },
  "full": {
    "src": "assets/band.webp",
    "width": 1400,
    "height": 906,
    "alt": "Группа Богема: вокалист с гитарой, вокалистка и музыканты с саксофоном",
    "caption": "На фото — группа Богема"
  },
  "extended": {
    "src": "assets/formats-full.webp",
    "width": 1200,
    "height": 777,
    "alt": "Участники Богемы на общей фотосессии",
    "caption": "На фото — группа Богема"
  }
});
export const LINEUPS = Object.freeze([
  {id:'solo', label:'Вокалист-гитарист', members:1, roles:'Мужской вокал, гитара', difference:'Один музыкант, голос и гитара', videoId:'summer-rain'},
  {id:'trio', label:'Трио', members:3, roles:'Мужской и женский вокал, гитара, барабаны', difference:'Два голоса и ритм барабанов', videoId:null},
  {id:'optimal', label:'Оптимальный состав', members:null, roles:'Мужской и женский вокал, гитара, бас, барабаны', difference:'Ритм-секция с бас-гитарой', videoId:null},
  {id:'full', label:'Полный состав', members:null, roles:'Мужской и женский вокал, гитара, саксофон, бас, барабаны', difference:'К основному звучанию добавляется саксофон', videoId:null},
  {id:'extended', label:'Расширенный состав', members:null, roles:'Мужской и женский вокал, гитара, саксофон, клавишные, бас, барабаны', difference:'Саксофон и клавишные в одном составе', videoId:null},
].map(item => Object.freeze({...item, visual:Object.freeze(LINEUP_VISUALS[item.id])})));
export const CONTACT = Object.freeze({name:'Алексей Слобухо', role:'Руководитель группы', phone:'+79006363727', phoneLabel:'+7 (900) 636-37-27', email:'bogemaband@inbox.ru', telegram:'DonSe6astian'});
