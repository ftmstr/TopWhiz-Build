import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
/**
 * CI ONLY: intercept exact fake HTTPS CMS hostname and answer through actual
 * PostgreSQL 16 queries and the production-shaped HTTP handlers.
 * No public TLS listener, cloud credentials, external network or real content.
 */
import { createRequire } from "node:module";
import { handlePublicCmsRequest } from "../services/prices-worker/src/cms/public-http.mjs";
import { handleCmsMedia } from "../services/prices-worker/src/cms/media-handler.mjs";
import {
  publicCmsDetailSql,publicCmsListSql,publicMediaAssetSql
} from "../services/prices-worker/src/cms/public-sql.mjs";

if(process.env.TOPWHIZ_SYNTHETIC_API==="1"){
  if(process.env.CI!=="true"||process.env.TOPWHIZ_CMS_API_HOST!=="cms.ci.invalid"||
     process.env.TOPWHIZ_CMS_API_BASE!=="https://cms.ci.invalid/"||
     !process.env.TEST_DATABASE_URL)throw Error("CI-only CMS API shim security precondition missing");
  const requireFromService=createRequire(new URL("../services/prices-worker/package.json",import.meta.url));
  const {Pool}=requireFromService("pg");
  const pool=new Pool({
    connectionString:process.env.TEST_DATABASE_URL,
    options:"-c search_path=tur007_ssr_ci",max:3
  });
  const originalFetch=globalThis.fetch.bind(globalThis);
  const readContent=async(type,slug)=>{
    const sql=slug===undefined?publicCmsListSql:publicCmsDetailSql;
    const args=slug===undefined?[type]:[type,slug];
    const {rows}=await pool.query(sql,args);
    return slug===undefined?rows:rows[0]??null;
  };
  const findAsset=async(id)=>(await pool.query(publicMediaAssetSql,[id])).rows[0]??null;
  const png=makeSyntheticPng();
  const bucket={
    async get(key){
      if(!/^media\/reviewed\/ci-ssr-hero\/[a-f0-9]{64}\.png$/.test(key))return null;
      return {size:png.length,body:new Response(png).body,
        customMetadata:{sha256:key.split("/").at(-1).slice(0,64)},
        httpMetadata:{contentType:"image/png"}};
    }
  };
  globalThis.fetch=async(input,init)=>{
    const link=typeof input==="string"?input:input instanceof URL?input.href:input.url;
    let url;try{url=new URL(link)}catch{return originalFetch(input,init)}
    if(url.hostname!=="cms.ci.invalid")return originalFetch(input,init);
    if(url.protocol!=="https:"||url.port||url.username||url.password)
      return new Response(null,{status:403});
    const request=new Request(url.href,{method:init?.method??"GET"});
    if(url.pathname==="/v1/content"||url.pathname.startsWith("/v1/content/"))
      return handlePublicCmsRequest(request,readContent);
    if(url.pathname.startsWith("/v1/media/"))
      return handleCmsMedia(request,{findApprovedAsset:findAsset,bucket});
    return new Response(null,{status:404});
  };
}
