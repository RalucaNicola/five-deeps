import {
  property,
  subclass,
} from "@arcgis/core/core/accessorSupport/decorators";
import Extent from "@arcgis/core/geometry/Extent";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import BaseElevationLayer from "@arcgis/core/layers/BaseElevationLayer";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import TileInfo from "@arcgis/core/layers/support/TileInfo";
import { IDBPDatabase, openDB } from "idb";

@subclass("CachedElevationLayer")
export class CachedElevationLayer extends BaseElevationLayer {
  @property()
  url!: string;

  @property()
  get tileInfo(): TileInfo {
    return this._sourceLayer?.tileInfo;
  }

  @property()
  get fullExtent(): Extent {
    return this._sourceLayer?.fullExtent;
  }

  @property()
  get spatialReference(): SpatialReference {
    return this._sourceLayer?.spatialReference;
  }

  private _sourceLayer!: ElevationLayer;
  private _db!: IDBPDatabase;

  constructor(properties: { url: string }) {
    super(properties as any);
  }

  async load(): Promise<this> {
    if (!this._sourceLayer) {
      this._sourceLayer = new ElevationLayer({ url: this.url });
    }

    this.addResolvingPromise(this._sourceLayer.load());

    this.addResolvingPromise(
      openDB("elevation-data-cache", 1, {
        upgrade: (db, oldVersion) => {
          if (!oldVersion) {
            db.createObjectStore("tile-data");
          }
        },
      }).then((db) => {
        this._db = db;
      })
    );

    return this;
  }

  async fetchTile(
    level: number,
    row: number,
    column: number,
    options?: __esri.ElevationLayerFetchTileOptions
  ): Promise<__esri.ElevationTileData> {
    const key = `${this.url}/${level}/${row}/${column}`;

    const store = this._db.transaction("tile-data").objectStore("tile-data");
    const cached = await store.get(key);

    if (cached) {
      return cached;
    }

    const ret = await this._sourceLayer.fetchTile(level, row, column, options);

    const cacheItem = {
      width: ret.width,
      height: ret.height,
      values: ret.values,
      maxZError: ret.maxZError,
      noDataValue: ret.noDataValue,
    };

    try {
      const store = this._db
        .transaction("tile-data", "readwrite")
        .objectStore("tile-data");

      store.put(cacheItem, key).catch((err) => console.error(err));
    } catch (err) {
      console.error(err);
    }

    return ret;
  }
}
