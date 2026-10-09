import type { EChartsCoreOption } from 'echarts/core';
import { runnerColor, type ReportBand } from './simulation-report';

export function reportLineChart(x:number[],rows:{source:number;name:string;bands:ReportBand[]}[],unit:string,dark:boolean,focus?:number):EChartsCoreOption {
  const color=dark?'#abb0ba':'#596271',grid=dark?'#292d33':'#e1e5eb';
  return {animation:false,textStyle:{fontFamily:'inherit',color},grid:{left:62,right:22,top:20,bottom:32},
    tooltip:{trigger:'axis',backgroundColor:dark?'#202226':'#fff',borderColor:grid,textStyle:{color},valueFormatter:(v:unknown)=>typeof v==='number'?v.toFixed(2)+' '+unit:String(v)},
    xAxis:{type:'value',min:x[0]??0,max:x.at(-1)??1,axisLabel:{color,fontSize:10,hideOverlap:true,formatter:'{value} m'},splitLine:{show:false},axisLine:{lineStyle:{color:grid}}},
    yAxis:{type:'value',scale:true,splitNumber:4,name:unit,nameTextStyle:{color,fontSize:10},axisLabel:{color,fontSize:10},splitLine:{lineStyle:{color:grid,type:'dashed'}}},
    series:rows.flatMap(row=>{
      const colour=runnerColor(row.source),name=row.name;
      const line={name,type:'line',showSymbol:false,lineStyle:{color:colour,width:2},itemStyle:{color:colour},data:x.map((v,i)=>[v,row.bands[i]?.[4]?row.bands[i]![0]:null]),
        markLine:unit==='s gained'?{silent:true,symbol:'none',lineStyle:{color,opacity:.4},label:{show:false},data:[{yAxis:0}]}:undefined};
      if(row.source!==focus)return [line];
      return [{name:name+' p10',type:'line',stack:'range-'+row.source,stackStrategy:'all',tooltip:{show:false},showSymbol:false,lineStyle:{opacity:0},data:x.map((v,i)=>[v,row.bands[i]?.[1]??null])},
        {name:name+' middle 80%',type:'line',stack:'range-'+row.source,stackStrategy:'all',tooltip:{show:false},showSymbol:false,lineStyle:{opacity:0},areaStyle:{color:colour,opacity:.12},data:x.map((v,i)=>[v,(row.bands[i]?.[3]??0)-(row.bands[i]?.[1]??0)])},line];
    })};
}
