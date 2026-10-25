// Published shapes for native typed fields and record-table histories.
const text={type:'string'}, integer={type:'integer'}, flag={type:'boolean'}
const nullableText={type:['string','null']}
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',required,properties,additionalProperties:false})
const array=(items:unknown)=>({type:'array',items})
const recorded={recordedAt:integer,recordedBy:text}
const classification={enum:['general','hr','payroll']}
const fieldValue={type:['string','boolean','null']}
const values={type:'object',additionalProperties:fieldValue}
const variants=[
 {type:{const:'text'},validation:object({minLength:integer,maxLength:integer},['maxLength'])},
 {type:{const:'number'},validation:object({min:text,max:text},[])},
 {type:{const:'date'},validation:object({min:text,max:text},[])},
 {type:{const:'boolean'},validation:object({})},
 {type:{const:'select'},validation:object({options:array(object({value:text,label:text}))})},
]
const definitionBase={id:text,fieldId:text,version:integer,effectiveFrom:text,label:text,required:flag,employeeRead:flag,managerRead:flag,retired:flag,...recorded}
const definition={oneOf:variants.map(variant=>object({...definitionBase,...variant}))}
const effectiveDefinition={oneOf:variants.map(variant=>object({...definitionBase,key:text,classification,definitionVersionId:text,...variant}))}
const fieldHistory=object({id:text,personId:text,fieldId:text,definitionVersionId:text,effectiveFrom:text,sequence:integer,value:fieldValue,correctsId:nullableText,origin:{enum:['native','import']},revision:text,...recorded})
export const customFieldSchema=object({id:text,key:text,classification,...recorded,definition:{anyOf:[definition,{type:'null'}]},versions:array(definition)})
const projectedField=object({id:text,key:text,classification,definition:effectiveDefinition,currentDefinition:effectiveDefinition,value:fieldValue,valueRevisionId:nullableText,definitions:array(definition),history:array(fieldHistory)})
export const customFieldProjection=object({asOf:text,fields:array(projectedField)})
const column={oneOf:variants.map(variant=>object({key:text,label:text,required:flag,...variant}))}
const tableClassification={enum:['contact','general','hr','payroll']}
const tableVersion=object({id:text,version:integer,label:text,employeeRead:flag,managerRead:flag,columns:array(column),retired:flag,...recorded})
export const recordTableSchema=object({id:text,key:text,classification:tableClassification,builtIn:flag,current:tableVersion,versions:array(tableVersion)})
const rowVersion=object({id:text,sequence:integer,tableVersionId:text,effectiveFrom:text,values,removed:flag,origin:text,...recorded})
const row=object({id:text,effectiveFrom:nullableText,values:{anyOf:[values,{type:'null'}]},history:array(rowVersion)})
const projectedTable=object({id:text,key:text,label:text,classification:tableClassification,builtIn:flag,retired:flag,columns:array(column),versions:array(tableVersion),rows:array(row),formerRows:array(row)})
export const recordTableProjection=object({asOf:text,tables:array(projectedTable)})
export const recordTableReport=object({table:object({key:text,label:text,classification:tableClassification,columns:array(column)}),asOf:text,people:integer,rows:array(object({personId:text,person:text,rowId:text,effectiveFrom:text,values}))})
