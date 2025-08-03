import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Heatmap from 'ol/layer/Heatmap.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Overlay from 'ol/Overlay.js';
import { fromLonLat } from 'ol/proj.js';

export let map;
let heatLayer;
let markersLayer;
let popupOverlay;
let popupContent;

export function initMap() {
  const israel = [35.2137, 31.7683];

  markersLayer = new VectorLayer({
    source: new VectorSource()
  });

  heatLayer = new Heatmap({
    source: new VectorSource(),
    blur: 15,
    radius: 25,
    visible: false
  });

  map = new Map({
    target: 'map',
    layers: [
      new TileLayer({
        source: new OSM()
      }),
      markersLayer,
      heatLayer
    ],
    view: new View({
      center: fromLonLat(israel),
      zoom: 8
    })
  });

  const container = document.createElement('div');
  container.className = 'ol-popup';
  popupContent = document.createElement('div');
  container.appendChild(popupContent);
  document.getElementById('map').appendChild(container);
  popupOverlay = new Overlay({ element: container });
  map.addOverlay(popupOverlay);

  map.on('singleclick', (evt) => {
    const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
    if (feature) {
      const props = feature.getProperties();
      const report = props.report || {};
      const time = report.time ? new Date(report.time).toLocaleString() : '';
      popupContent.innerHTML = `<strong>${report.type || ''}</strong><br>${time}`;
      popupOverlay.setPosition(feature.getGeometry().getCoordinates());
    } else {
      popupOverlay.setPosition(undefined);
    }
  });
}

function parseCoords(report) {
  // First check if report has lat/lon properties (from geocoding)
  if (report.lat && report.lon && isFinite(report.lat) && isFinite(report.lon)) {
    return [report.lat, report.lon];
  }
  
  // Then check the location field
  const loc = report.location;
  if (!loc) return null;
  
  if (Array.isArray(loc) && loc.length === 2) {
    const [lat, lng] = loc.map(Number);
    if (isFinite(lat) && isFinite(lng)) return [lat, lng];
  }
  if (typeof loc === 'object') {
    const { lat, lng } = loc;
    if (isFinite(lat) && isFinite(lng)) return [lat, lng];
  }
  if (typeof loc === 'string') {
    try {
      const obj = JSON.parse(loc);
      return parseCoords({ location: obj });
    } catch {
      const parts = loc.split(',').map(p => parseFloat(p));
      if (parts.length === 2 && parts.every(isFinite)) return parts;
    }
  }
  return null;
}

export function plotReports(reports = []) {
  if (!map || !markersLayer || !heatLayer) return;
  const markerSrc = markersLayer.getSource();
  const heatSrc = heatLayer.getSource();
  markerSrc.clear();
  heatSrc.clear();

  const features = [];

  reports.forEach((r) => {
    const coords = parseCoords(r);
    if (!coords) return;
    const feature = new Feature({
      geometry: new Point(fromLonLat([coords[1], coords[0]])),
      report: r
    });
    features.push(feature);
  });

  markerSrc.addFeatures(features);
  heatSrc.addFeatures(features.map(f => f.clone()));

  if (features.length) {
    map.getView().fit(markerSrc.getExtent(), { padding: [50, 50, 50, 50] });
  }
}

export function toggleHeatmap() {
  if (!heatLayer) return;
  heatLayer.setVisible(!heatLayer.getVisible());
}

export function centerMap() {
  if (!map) return;
  const israel = fromLonLat([35.2137, 31.7683]);
  map.getView().setCenter(israel);
  map.getView().setZoom(8);
}
