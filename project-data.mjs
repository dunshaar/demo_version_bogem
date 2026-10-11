// Confirmed client offers. Roles do not imply a headcount.
export const LINEUPS = Object.freeze([
  {id:'solo', label:'Вокалист-гитарист', members:1, roles:'Мужской вокал, гитара', difference:'Один музыкант, голос и гитара', videoId:'summer-rain'},
  {id:'trio', label:'Трио', members:3, roles:'Мужской и женский вокал, гитара, барабаны', difference:'Два голоса и ритм барабанов', videoId:null},
  {id:'optimal', label:'Оптимальный состав', members:null, roles:'Мужской и женский вокал, гитара, бас, барабаны', difference:'Ритм-секция с бас-гитарой', videoId:null},
  {id:'full', label:'Полный состав', members:null, roles:'Мужской и женский вокал, гитара, саксофон, бас, барабаны', difference:'К основному звучанию добавляется саксофон', videoId:null},
  {id:'extended', label:'Расширенный состав', members:null, roles:'Мужской и женский вокал, гитара, саксофон, клавишные, бас, барабаны', difference:'Саксофон и клавишные в одном составе', videoId:null},
].map(Object.freeze));
export const CONTACT = Object.freeze({name:'Алексей Слобухо', role:'Руководитель группы', phone:'+79006363727', phoneLabel:'+7 (900) 636-37-27', email:'bogemaband@inbox.ru', telegram:'DonSe6astian'});
