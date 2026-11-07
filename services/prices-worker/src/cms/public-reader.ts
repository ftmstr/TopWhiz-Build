import { neon } from "@neondatabase/serverless";
import { publicCmsListSql, publicCmsDetailSql } from "./public-sql.mjs";
export type CmsType="news"|"phone";
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Neon uses exact same parameterized SQL tested on PostgreSQL in CI. */
export async function readPublishedCms(databaseUrl:string,type:CmsType,slug?:string){
  if(!["news","phone"].includes(type))throw Error("invalid_type");
  if(slug!==undefined && (slug.length>100||!SLUG.test(slug)))throw Error("invalid_slug");
  const sql=neon(databaseUrl);
  const result=slug===undefined
    ? await sql.query(publicCmsListSql,[type])
    : await sql.query(publicCmsDetailSql,[type,slug]);
  return slug===undefined?result:result[0]??null;
}
