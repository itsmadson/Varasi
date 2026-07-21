"""Sample public COGs for `varasi-ingest seed` (no auth, HTTP range-readable).

A real temporal pair over Tehran (Sentinel-2 tile 39SWV, 2020 vs 2024) so the
change-detection slice has something to run on, plus two other live COGs.
Verified reachable July 2026.
"""
from __future__ import annotations

SAMPLES = [
    {
        "collection": "sentinel-2-tehran",
        "uri": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/39/S/WV/2020/9/S2A_39SWV_20200924_0_L2A/TCI.tif",
        "datetime": "2020-09-24T00:00:00Z",
        "properties": {
            "sensor": "MSI",
            "satellite": "Sentinel-2A",
            "platform": "sentinel-2a",
            "eo:cloud_cover": 1,
            "varasi:provider": "AWS Open Data / Sentinel-2 COGs (Element84)",
            "varasi:mgrs_tile": "39SWV",
        },
    },
    {
        "collection": "sentinel-2-tehran",
        "uri": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/39/S/WV/2024/9/S2A_39SWV_20240923_0_L2A/TCI.tif",
        "datetime": "2024-09-23T00:00:00Z",
        "properties": {
            "sensor": "MSI",
            "satellite": "Sentinel-2A",
            "platform": "sentinel-2a",
            "eo:cloud_cover": 0,
            "varasi:provider": "AWS Open Data / Sentinel-2 COGs (Element84)",
            "varasi:mgrs_tile": "39SWV",
        },
    },
    {
        "collection": "aerial-naip",
        "uri": "https://naipeuwest.blob.core.windows.net/naip/v002/md/2013/md_100cm_2013/39076/m_3907617_ne_18_1_20130924.tif",
        "datetime": "2013-09-24T00:00:00Z",
        "properties": {
            "sensor": "aerial",
            "platform": "naip",
            "gsd": 1.0,
            "varasi:provider": "NAIP on Azure",
        },
    },
    {
        "collection": "dem-swissalti3d",
        "uri": "https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2019_2573-1085/swissalti3d_2019_2573-1085_0.5_2056_5728.tif",
        "datetime": "2019-01-01T00:00:00Z",
        "properties": {
            "sensor": "lidar",
            "platform": "swisstopo",
            "gsd": 0.5,
            "varasi:provider": "swisstopo swissALTI3D",
        },
    },
]
