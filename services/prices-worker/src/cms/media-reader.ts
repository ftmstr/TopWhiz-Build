import { neon } from "@neondatabase/serverless";
import { publicMediaAssetSql } from "./public-sql.mjs";
const ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
/** R2 access after database approval and latest publicly published reference. */
export async function readApprovedMediaAsset(databaseUrl:string,assetId:string){
  if(!ID.test(assetId))throw Error("invalid_asset_id");
  const sql=neon(databaseUrl);
  const records=await sql.query(publicMediaAssetSql,[assetId]);
  return records[0]??null;
}
