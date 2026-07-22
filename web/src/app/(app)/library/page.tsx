"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { Modal } from "@/components/Modal";
import { PageHeader, Spinner } from "@/components/ui";
import { api, type StacItem } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { GeoJSONFC } from "@/lib/api";

export default function LibraryPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [collection, setCollection] = useState<string>("");
  const [selected, setSelected] = useState<StacItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [uri, setUri] = useState("");
  const [newCol, setNewCol] = useState("");
  const [date, setDate] = useState("");

  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });

  const ingest = useMutation({
    mutationFn: () => api.ingest({ uri, collection: newCol, datetime: date || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["scenes"] });
      setAddOpen(false);
      setUri("");
      setNewCol("");
      setDate("");
    },
  });
  const search = useQuery({
    queryKey: ["scenes", collection],
    queryFn: () => api.search(collection ? { collections: [collection], limit: 100 } : { limit: 100 }),
  });

  const scenes = search.data?.features ?? [];
  const footprints: GeoJSONFC = useMemo(
    () => ({
      type: "FeatureCollection",
      features: scenes.map((f) => ({ type: "Feature", geometry: f.geometry, properties: { id: f.id } })),
    }),
    [scenes],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 px-6 pb-4 pt-6">
        <PageHeader
          title={t("lib.title")}
          subtitle={t("lib.subtitle")}
          actions={
            <button className="btn" onClick={() => setAddOpen(true)}>
              + {t("raster.add")}
            </button>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">{t("lib.collection")}</span>
          <button
            onClick={() => setCollection("")}
            className="chip"
            style={{
              color: collection === "" ? "var(--bg)" : "var(--muted)",
              background: collection === "" ? "var(--accent)" : "transparent",
              borderColor: collection === "" ? "var(--accent)" : "var(--border)",
            }}
          >
            {t("lib.all")}
          </button>
          {collections.data?.collections.map((c) => (
            <button
              key={c.id}
              onClick={() => setCollection(c.id)}
              className="chip"
              style={{
                color: collection === c.id ? "var(--bg)" : "var(--muted)",
                background: collection === c.id ? "var(--accent)" : "transparent",
                borderColor: collection === c.id ? "var(--accent)" : "var(--border)",
              }}
            >
              {c.id}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[1fr_420px]">
        <div className="min-h-0 overflow-auto p-5">
          {search.isLoading ? (
            <Spinner label={t("common.loading")} />
          ) : scenes.length === 0 ? (
            <div className="telemetry py-16 text-center text-xs" style={{ color: "var(--muted)" }}>
              {t("lib.empty")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {scenes.map((s) => (
                <SceneCard
                  key={s.id}
                  item={s}
                  active={selected?.id === s.id}
                  onClick={() => setSelected(selected?.id === s.id ? null : s)}
                  dateLabel={t("lib.date")}
                />
              ))}
            </div>
          )}
        </div>

        <div className="relative min-h-0 border-t lg:border-s lg:border-t-0">
          <MapView
            footprints={footprints}
            rasterItem={selected ? { collection: selected.collection, id: selected.id } : null}
            className="absolute inset-0"
          />
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t("raster.add")}>
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            ingest.mutate();
          }}
        >
          <div>
            <label className="label mb-1 block">{t("raster.uri")}</label>
            <input
              className="input"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="https://…/scene.tif"
              required
            />
            <p className="telemetry mt-1 text-[9px]" style={{ color: "var(--muted)" }}>
              {t("raster.uriHint")}
            </p>
          </div>
          <div>
            <label className="label mb-1 block">{t("raster.collection")}</label>
            <input
              className="input"
              value={newCol}
              onChange={(e) => setNewCol(e.target.value)}
              placeholder="my-collection"
              list="existing-collections"
              required
            />
            <datalist id="existing-collections">
              {collections.data?.collections.map((c) => (
                <option key={c.id} value={c.id} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label mb-1 block">{t("raster.date")}</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {ingest.isError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {(ingest.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>
              {t("action.cancel")}
            </button>
            <button type="submit" className="btn" disabled={!uri || !newCol || ingest.isPending}>
              {ingest.isPending ? t("raster.ingesting") : t("raster.add")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SceneCard({
  item,
  active,
  onClick,
  dateLabel,
}: {
  item: StacItem;
  active: boolean;
  onClick: () => void;
  dateLabel: string;
}) {
  const thumb = item.assets?.thumbnail?.href;
  const date = String(item.properties.datetime ?? "").slice(0, 10);
  const cloud = item.properties["eo:cloud_cover"];
  return (
    <button
      onClick={onClick}
      className="panel group overflow-hidden text-start transition-transform hover:-translate-y-0.5"
      style={{ outline: active ? "2px solid var(--accent)" : "none" }}
    >
      <div className="aspect-square w-full" style={{ background: "var(--panel-2)" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={item.id} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center telemetry text-[10px]" style={{ color: "var(--muted)" }}>
            NO PREVIEW
          </div>
        )}
      </div>
      <div className="p-2.5">
        <div className="truncate text-xs font-500">{item.collection}</div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
            {dateLabel} {date}
          </span>
          {typeof cloud === "number" && (
            <span className="chip !px-1.5 !py-0">☁ {Math.round(cloud)}%</span>
          )}
        </div>
      </div>
    </button>
  );
}
