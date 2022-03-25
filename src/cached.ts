import Extent from "@arcgis/core/geometry/Extent";
import Mesh from "@arcgis/core/geometry/Mesh";
import MeshTexture from "@arcgis/core/geometry/support/MeshTexture";
import { createFromElevation } from "@arcgis/core/geometry/support/meshUtils";
import { IDBPDatabase, openDB } from "idb";

export async function meshCreateFromElevation(
  sampler: __esri.ElevationSampler,
  extent: Extent,
  options?: __esri.meshUtilsCreateFromElevationOptions
): Promise<Mesh> {
  const db = await openCache();

  const store = db.transaction("meshes").objectStore("meshes");
  const key = `${JSON.stringify(extent.toJSON())}/${options?.demResolution ?? 0}`;
  const existing = await store.get(key);

  if (existing) {
    return Mesh.fromJSON(existing);
  }

  const ret = await createFromElevation(sampler, extent, options);
  const writeStore = db.transaction("meshes", "readwrite").objectStore("meshes");

  writeStore.put(ret.toJSON(), key);
  return ret;
}

export async function getMesh(key: string): Promise<Mesh | null> {
  const db = await openCache();

  const store = db.transaction("meshes").objectStore("meshes");
  const existing = await store.get(key);

  return existing ? Mesh.fromJSON(existing) : null;
}

export async function putMesh(key: string, mesh: Mesh): Promise<void> {
  const db = await openCache();

  const store = db.transaction("meshes", "readwrite").objectStore("meshes");
  await store.put(mesh.toJSON(), key);
}

export async function getMeshTexture(key: string): Promise<MeshTexture | null> {
  const db = await openCache();

  const store = db.transaction("textures").objectStore("textures");
  const existing = await store.get(key);

  return existing ? (MeshTexture as any).fromJSON(existing) : null;
}

export async function putMeshTexture(key: string, texture: MeshTexture): Promise<void> {
  const db = await openCache();

  const store = db.transaction("textures", "readwrite").objectStore("textures");
  await store.put((texture as any).toJSON(), key);
}

async function openCache(): Promise<IDBPDatabase> {
  const db = await openDB("diarama-cache", 2, {
    upgrade: (db, oldVersion, newVersion) => {
      for (let i = oldVersion; i <= (newVersion ?? 0); i++) {
        switch (i) {
          case 0:
            db.createObjectStore("meshes");
            break;
          case 1:
            db.createObjectStore("textures");
            break;
        }
      }
    }
  });

  const tr = db.transaction(["meshes", "textures"], "readwrite");
  await Promise.all([tr.objectStore("meshes").clear(), tr.objectStore("textures").clear()]);
  return db;
}
