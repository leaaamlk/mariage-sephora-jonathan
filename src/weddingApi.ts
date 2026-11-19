const endpoint = 'https://ukwblchnlkgnjqclqigt.supabase.co/functions/v1/wedding-pin'
const publishableKey = 'sb_publishable_oUB_kqCNyiXS8m5RVlL0CQ_SKfbBrxq'
export async function weddingApi(pin:string,action:string,params:Record<string,unknown>={}):Promise<any> {
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':publishableKey},body:JSON.stringify({pin,action,...params})})
 const result=await response.json()
 if(!response.ok)throw new Error(result.error||'Connexion impossible')
 return result
}
