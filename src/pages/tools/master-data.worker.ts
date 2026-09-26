import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { ungzip } from 'pako';

let database: Database | undefined;
const quote = (name: string) => `"${name.replaceAll('"','""')}"`;
const SQL = initSqlJs({ locateFile: () => wasmUrl });

self.onmessage = async (event: MessageEvent<{ id:number; kind:'catalog'|'file'|'query'; bytes?:Uint8Array; sql?:string }>) => {
  const {id,kind,bytes,sql}=event.data;
  try {
    const engine=await SQL;
    if(kind!=='query') {
      let next:Database;
      if(kind==='file'&&bytes) next=new engine.Database(bytes[0]===0x1f&&bytes[1]===0x8b?ungzip(bytes):bytes);
      else {
        const response=await fetch('/hakuraku/umdb.json.gz');
        if(!response.ok) throw new Error(`Catalog unavailable (${response.status})`);
        const payload=new Uint8Array(await response.arrayBuffer());
        const catalog:Record<string,unknown>=JSON.parse(new TextDecoder().decode(payload[0]===0x1f&&payload[1]===0x8b?ungzip(payload):payload));
        next=new engine.Database();
        try {
          next.run('BEGIN');
          for(const [name,values] of Object.entries(catalog)) {
            if(!Array.isArray(values)||!values.length) continue;
            const rows=values as Record<string,unknown>[];
            const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
            if(!columns.length) continue;
            next.run(`CREATE TABLE ${quote(name)} (${columns.map(column=>`${quote(column)} ${rows.some(row=>typeof row[column]==='number')?'NUMERIC':'TEXT'}`).join(',')})`);
            const statement=next.prepare(`INSERT INTO ${quote(name)} VALUES (${columns.map(()=>'?').join(',')})`);
            try { for(const row of rows) statement.run(columns.map(column=>{const value=row[column];return value==null?null:typeof value==='number'||typeof value==='string'?value:JSON.stringify(value);})); }
            finally { statement.free(); }
          }
          next.run('COMMIT');
        } catch(error) { next.close();throw error; }
      }
      database?.close();database=next;
      database.run('PRAGMA query_only = ON');
      const tables=database.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]?.values.map(row=>String(row[0]))??[];
      const schema=Object.fromEntries(tables.map(table=>[table,database!.exec(`PRAGMA table_info(${quote(table)})`)[0]?.values.map(row=>String(row[1]))??[]]));
      self.postMessage({id,schema});
    } else {
      if(!database) throw new Error('Load a database first.');
      database.run('PRAGMA query_only = ON');
      const statement=database.prepare(sql??'');
      try {
        const columns=statement.getColumnNames();
        const values:SqlValue[][]=[];
        while(values.length<1000&&statement.step()) values.push(statement.get());
        const truncated=values.length===1000&&statement.step();
        self.postMessage({id,columns,values,truncated});
      } finally { statement.free(); }
    }
  } catch(error) { self.postMessage({id,error:error instanceof Error?error.message:String(error)}); }
};
