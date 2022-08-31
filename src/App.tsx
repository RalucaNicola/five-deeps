import { property, subclass } from "@arcgis/core/core/accessorSupport/decorators";
import Widget from "@arcgis/core/widgets/Widget";
import { tsx } from "@arcgis/core/widgets/support/widget";
import SceneView from "@arcgis/core/views/SceneView";
import Map from "@arcgis/core/Map";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { Configuration } from "./Configuration";
import { DioramaBuilder } from "./DioramaBuilder";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import "@esri/calcite-components/dist/components/calcite-label";
import "@esri/calcite-components/dist/components/calcite-select";
import "@esri/calcite-components/dist/components/calcite-option";
import "@esri/calcite-components/dist/components/calcite-input";

import { setAssetPath } from "@esri/calcite-components/dist/components";
import { when } from "@arcgis/core/core/reactiveUtils";
import { addFrameTask } from "@arcgis/core/core/scheduling";
import Camera from "@arcgis/core/Camera";
import MediaLayer from "@arcgis/core/layers/MediaLayer";
import ImageElement from "@arcgis/core/layers/support/ImageElement";
import Extent from "@arcgis/core/geometry/Extent";
import ExtentAndRotationGeoreference from "@arcgis/core/layers/support/ExtentAndRotationGeoreference";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import Ground from "@arcgis/core/Ground";
import Basemap from "@arcgis/core/Basemap";
import TileLayer from "@arcgis/core/layers/TileLayer";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import LabelClass from "@arcgis/core/layers/support/LabelClass";
import LabelSymbol3D from "@arcgis/core/symbols/LabelSymbol3D";
import TextSymbol3DLayer from "@arcgis/core/symbols/TextSymbol3DLayer";
import { SimpleRenderer } from "@arcgis/core/renderers";
import { IconSymbol3DLayer, PointSymbol3D } from "@arcgis/core/symbols";
import Graphic from "@arcgis/core/Graphic";

import { viewpoints } from './viewpoints';
import Home from "@arcgis/core/widgets/Home";
import Viewpoint from "@arcgis/core/Viewpoint";

setAssetPath("https://js.arcgis.com/calcite-components/1.0.0-beta.80/assets");

const color = [255, 255, 255];

@subclass("App")
export class App extends Widget {
  private config = new Configuration();

  private readonly initialCamera = new Camera({
    position: {
      x: -0.00126813,
      y: -0.00107487,
      z: 114.00350
    },
    heading: 49.60,
    tilt: 69.68
  });

  private view = new SceneView({
    map: new Map({
      ground: {
        opacity: 0,
        surfaceColor: [100, 100, 50]
      }
    }),

    camera: this.initialCamera,

    clippingArea: this.config.displayArea,
    alphaCompositingEnabled: true,

    environment: {
      atmosphereEnabled: false,
      starsEnabled: false,
      background: { type: "color", color: [255, 255, 255, 0] },
      lighting: {
        date: "Tue Mar 15 2022 08:05:00 GMT-0700 (Pacific Daylight Time)"
      }
    },

    spatialReference: SpatialReference.WebMercator,
    qualityProfile: "high",
    viewingMode: "local"
  });

  private pointsLayer = new GeoJSONLayer({
    url: "./data/points.geojson",
    outFields: ["*"],
    renderer: new SimpleRenderer({
      symbol: new PointSymbol3D({
        symbolLayers: [new IconSymbol3DLayer({
          resource: { href: "./assets/icon.svg" },
          anchor: "relative",
          anchorPosition: {
            x: -0.4,
            y: 0
          },
          size: 40
        })]
      })
    }),
    labelingInfo: [
      new LabelClass({
        labelExpressionInfo: { expression: "$feature.name" },
        labelPlacement: "center-right",
        symbol: new LabelSymbol3D({
          symbolLayers: [new TextSymbol3DLayer({
            material: {
              color: [50, 50, 50]
            },

            background: { color: color },
            font: {
              size: 12,
              family: `"Avenir Next", "Avenir", "Helvetica Neue", sans-serif`,
              weight: "bolder"
            }
          })]
        })
      })
    ]
  });

  private cloudsLayer = new MediaLayer({
    source: [new ImageElement({
      image: "./assets/clouds-nasa.png",
      georeference: new ExtentAndRotationGeoreference({
        extent: new Extent({
          spatialReference: {
            wkid: 4326
          },
          xmin: -180,
          xmax: 180,
          ymin: -80,
          ymax: 80
        }),
        rotation: 0
      })
    })],
  });

  private highlightGraphicsLayer = new GraphicsLayer({
  });

  private selectView = new SceneView({
    map: new Map({
      ground: new Ground({
        layers: [new ElevationLayer({
          url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer"
        })],
        surfaceColor: [255, 255, 255]
      }),
      basemap: new Basemap({
        baseLayers: [
          new TileLayer({
            url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer", opacity: 0.7
          }),
          new TileLayer({
            url: "https://tiles.arcgis.com/tiles/C8EMgrsFcRFL6LrL/arcgis/rest/services/GEBCO_basemap_NCEI/MapServer",
            blendMode: "multiply"
          }),
        ]
      }),
      layers: [this.highlightGraphicsLayer, this.cloudsLayer]
    }),
    ui: { components: [] },
    qualityProfile: "high"
  });

  private dioramaBuilder = new DioramaBuilder({ view: this.view, config: this.config });

  private highlightGraphic = new Graphic({
    symbol: new PointSymbol3D({
      symbolLayers: [new IconSymbol3DLayer({
        resource: { primitive: "circle" },
        size: 10,
        material: {
          color: [0, 0, 0, 0]
        },
        outline: {
          color: color,
          size: 2
        }
      }), new IconSymbol3DLayer({
        resource: { primitive: "circle" },
        size: 20,
        material: {
          color: [0, 0, 0, 0]
        },
        outline: {
          color: [...color, 0.7],
          size: 2
        }
      }), new IconSymbol3DLayer({
        resource: { primitive: "circle" },
        size: 30,
        material: {
          color: [0, 0, 0, 0]
        },
        outline: {
          color: [...color, 0.4],
          size: 2
        }
      })]
    })
  });

  @property()
  private highlightedPoint: OceanPoint | null = null;

  private selected = false;

  protected initialize(): void {

    when(
      () => !this.selectView.updating,
      () => {
        this.startGlobeAnimation();

        this.selectView.on('pointer-move', (event) => {
          this.selectView.hitTest(event, { include: this.pointsLayer }).then(hitTestResult => {
            const results = hitTestResult.results;
            if (results && results.length > 0) {
              const graphic = (results[0] as GraphicHit).graphic;
              if (!this.highlightedPoint || this.highlightedPoint.name !== graphic.attributes.name) {
                this.highlightGraphic.geometry = graphic.geometry;
                this.selectView.graphics.add(this.highlightGraphic);
                this.elements.selectViewer.style.cursor = "pointer";
                this.highlightedPoint = graphic.attributes;
                this.elements.overlayInfo.classList.add('fade-in');
              }
            } else {
              this.selectView.graphics.removeAll();
              this.elements.selectViewer.style.cursor = "default";
              this.highlightedPoint = null;
              this.elements.overlayInfo.innerHTML = ``;
              this.elements.overlayInfo.classList.remove('fade-in');
            }
          }).catch(console.error);
        });
        this.selectView.on('click', (event) => {
          if (this.animationFrameTask) {
            this.stopGlobeAnimation();
          }
          this.selectView.hitTest(event, { include: this.pointsLayer }).then(hitTestResult => {
            const results = hitTestResult.results;
            if (results && results.length > 0) {
              const graphic = (results[0] as GraphicHit).graphic;
              const extent = new Extent(viewpoints[graphic.attributes.name].extent);
              this.highlightedPoint = graphic.attributes;
              this.showDiorama(extent);
              this.view.goTo(viewpoints[graphic.attributes.name].camera);
              this.selected = true;
              this.elements.overlayInfo.classList.add('fade-in');
            }
          }).catch(console.error);
        })
      },
      { once: true }
    );

    when(() => Math.floor(this.selectView.zoom),
      (value) => {
        if (value) {
          this.cloudsLayer.opacity = 0.02 * Math.pow(value - 10, 2);
        }
      });

    const homeWidget = new Home({
      view: this.view,
      viewpoint: new Viewpoint({ camera: this.initialCamera })
    });

    this.view.ui.add(homeWidget, "top-left");
  }

  private animationFrameTask: __esri.FrameTaskHandle | null = null;

  private startGlobeAnimation(): void {
    this.elements.selectViewer.classList.add("fade-in");

    let t = 0;
    const rotationDurationSeconds = 100;

    const update = () => {
      const camera = this.selectView.camera.clone();
      camera.position.longitude = -(360 * (t / 1000 / rotationDurationSeconds)) % 360;
      this.selectView.goTo(camera, { animate: false });
    };

    this.animationFrameTask = addFrameTask({
      update: ev => {
        t += ev?.deltaTime ?? 0;
        update();
      },
    });

    when(
      () => this.selectView.interacting,
      () => {
        this.stopGlobeAnimation()
      },
      { once: true }
    );
  }

  private stopGlobeAnimation() {
    this.animationFrameTask?.remove();
    this.animationFrameTask = null;
  }

  private elements = {
    selectViewer: null! as HTMLDivElement,
    dioramaViewer: null! as HTMLDivElement,
    intro: null! as HTMLDivElement,
    overlayInfo: null! as HTMLDivElement,
    appTitle: null! as HTMLTitleElement
  };

  render() {
    const overlayInfoContainer = this.highlightedPoint ? (
      <div class="container">
        <div class="left-info">
          <div class="title" afterCreate={(node: HTMLDivElement) => (
            this.selected ?
              node.classList.add('big') : setTimeout(() => node.classList.add('big'), 0)
          )}>
            <p>{this.highlightedPoint.name}</p>
          </div>
          <div class="info">
            <p>Discovered in {this.highlightedPoint.year}</p>
            <p>{formatNumber(this.highlightedPoint.depth)} m deep</p>
            <p>{this.highlightedPoint.ocean}</p>
          </div>
        </div>
        <div class="separator"></div>
        <div class="right-info">
          <p>{this.highlightedPoint.description}</p>
        </div>
      </div >
    ) : null;

    return (
      <div id="main">
        <div id="viewer">
          <div id="diorama-viewer" afterCreate={(node: HTMLDivElement) => (this.elements.dioramaViewer = node)}>
            <div id="viewDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreate(node)}></div>
            <button class="close" onclick={() => this.showGlobe()}>
              <img src="./assets/close.svg"></img>
            </button>
          </div>
          <div id="select-viewer" afterCreate={(node: HTMLDivElement) => (this.elements.selectViewer = node)}>
            <div id="selectAreaDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreateSelectArea(node)}></div>
          </div>
        </div>
        <div class="about"> Inspired by The Five deeps <a href="https://www.youtube.com/watch?v=tn4GJyuKBN8&ab_channel=Esri" target="_blank">video</a> and <a href="https://experience.arcgis.com/experience/b0d24697de5e4036aedc517c02a04454/" target="_blank">map</a> | Powered by <a href="https://www.esri.com/en-us/home" target="blank">Esri</a>'s <a href="https://developers.arcgis.com/javascript/latest/" target="_blank">ArcGIS API for JavaScript</a> | <a href="https://www.arcgis.com/home/item.html?id=0c69ba5a5d254118841d43f03aa3e97d" target="_blank">TopoBathy 3D elevation layer</a>.</div>
        <div class="overlay-info" afterCreate={(node: HTMLDivElement) => (this.elements.overlayInfo = node)}>
          {overlayInfoContainer}
        </div>
        <div class="intro" afterCreate={(node: HTMLDivElement) => (this.elements.intro = node)}>
          <h1>THE FIVE DEEPS</h1>
          <p>Over 80% of the ocean remains uncharted and unexplored. The United Nations' Seabed 2030 project aims to map the entirety of the ocean floor by the end of this decade.</p>
          <button class="intro-button" onclick={() => this.hideIntro()}>Explore the deepest point in each of Earth's oceans</button>
        </div>
        <div class="app-title" afterCreate={(node: HTMLTitleElement) => (this.elements.appTitle = node)}>
          <h1>THE FIVE DEEPS</h1>
          <div class="point-list">
            <button onclick={(evt: PointerEvent) => this.goTo(evt)}>South Sandwich Trench</button>
            <button onclick={(evt: PointerEvent) => this.goTo(evt)}>Puerto Rico Trench</button>
            <button onclick={(evt: PointerEvent) => this.goTo(evt)}>Mariana Trench</button>
            <button onclick={(evt: PointerEvent) => this.goTo(evt)}>Molloy Hole</button>
            <button onclick={(evt: PointerEvent) => this.goTo(evt)}>Java Trench</button>
          </div>
        </div>

      </div>
    );
  }

  private animateGraphicOpacity(graphic: Graphic) {
    this.highlightGraphicsLayer.opacity = 0;
    this.highlightGraphicsLayer.add(graphic);
    let increment = 0.1;
    const animateOpacity = (opacity: number) => {
      this.highlightGraphicsLayer.opacity = Math.max(Math.min(opacity, 1), 0);
      if (opacity > 1) {
        window.setTimeout(() => {
          increment = -0.1;
        }, 100);
      }
      if (opacity >= 0) {
        requestAnimationFrame(() => { animateOpacity(opacity + increment) });
      }
    }
    animateOpacity(0);
  }

  private goTo(evt: PointerEvent): void {
    if (evt.target && evt.target instanceof HTMLButtonElement) {
      const name = evt.target.innerHTML;
      this.pointsLayer.queryFeatures({ where: `name='${name}'`, returnGeometry: true })
        .then(result => {
          if (this.animationFrameTask) {
            this.stopGlobeAnimation();
          }
          this.selectView.goTo({ target: result.features[0].geometry, zoom: 4 })
            .then(() => {
              this.highlightGraphic.geometry = result.features[0].geometry;
              this.animateGraphicOpacity(this.highlightGraphic);
            })
        });
    }

  }

  private hideIntro(): void {
    this.elements.intro.classList.add('fade-out');
    this.elements.appTitle.classList.add('fade-in');
    this.selectView.map.add(this.pointsLayer);
  }

  private showGlobe(): void {
    this.elements.dioramaViewer.classList.remove("fade-in");
    this.dioramaBuilder.destroyDiorama();
    this.elements.selectViewer.classList.add("fade-in");
    this.elements.appTitle.style.display = "revert";
    this.highlightedPoint = null;
    this.selected = false;
  }

  private showDiorama(extent: Extent): void {
    this.view.camera = this.initialCamera;
    this.dioramaBuilder.generateDiorama(extent);
    this.stopGlobeAnimation();
    this.elements.dioramaViewer.classList.add("fade-in");
    this.elements.selectViewer.classList.remove("fade-in");
    this.elements.appTitle.style.display = "none";
  }

  private onAfterCreate(element: HTMLDivElement): void {
    this.view.container = element;
    (window as any).view = this.view;
  }

  private onAfterCreateSelectArea(element: HTMLDivElement): void {
    this.selectView.container = element;
    (window as any).selectView = this.selectView;

  }
}

const formatNumber = (number: number): string => {
  return new Intl.NumberFormat("en-US").format(number);
};

interface OceanPoint {
  name: string;
  year: number;
  depth: number;
  ocean: string;
  description: string;
}

interface GraphicHit {
  graphic: Graphic;
}