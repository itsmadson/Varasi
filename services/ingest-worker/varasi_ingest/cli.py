"""varasi-ingest command line."""
from __future__ import annotations

import json
import sys

import click

from .config import Settings
from .pipeline import ingest_source
from .samples import SAMPLES


def _echo(level: str, msg: str) -> None:
    colors = {"ok": "green", "error": "red", "info": "cyan"}
    click.secho(f"[{level}] {msg}", fg=colors.get(level, "white"))


@click.group()
def cli() -> None:
    """Varasi metadata-first raster ingestion."""


@cli.command()
@click.option("--uri", required=True, help="Source: file:///dir, https://..cog.tif, s3://bucket/prefix")
@click.option("--collection", required=True, help="Virtual Dataset id")
@click.option("--datetime", "datetime_str", default=None, help="Acquisition datetime (ISO)")
@click.option("--prop", "props", multiple=True, help="Extra property key=value (repeatable)")
@click.option("--no-thumbnail", is_flag=True, help="Skip quicklook generation")
def ingest(uri, collection, datetime_str, props, no_thumbnail) -> None:
    """Ingest a raster source into the catalog."""
    properties = {}
    for kv in props:
        k, _, v = kv.partition("=")
        properties[k] = v
    res = ingest_source(
        uri,
        collection,
        cfg=Settings(),
        datetime_str=datetime_str,
        properties=properties or None,
        with_thumbnail=not no_thumbnail,
        on_progress=_echo,
    )
    click.secho(
        f"\ncollection={res.collection} ingested={res.ingested} failed={res.failed}",
        fg="green" if res.failed == 0 else "yellow",
    )
    sys.exit(1 if res.ingested == 0 else 0)


@cli.command()
def seed() -> None:
    """Ingest the built-in sample public COGs."""
    cfg = Settings()
    total = 0
    for s in SAMPLES:
        _echo("info", f"seeding {s['uri']}")
        res = ingest_source(
            s["uri"],
            s["collection"],
            cfg=cfg,
            datetime_str=s.get("datetime"),
            properties=s.get("properties"),
            on_progress=_echo,
        )
        total += res.ingested
    click.secho(f"\nseed complete: {total} items ingested", fg="green")


@cli.command()
def providers() -> None:
    """List available source providers."""
    from .providers import _REGISTRY

    click.echo(json.dumps({k: v.__name__ for k, v in _REGISTRY.items()}, indent=2))


if __name__ == "__main__":
    cli()
