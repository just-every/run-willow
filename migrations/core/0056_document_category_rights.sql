CREATE TABLE wl_level_document_categories (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 category_id TEXT NOT NULL REFERENCES wl_doc_categories(id),
 mode TEXT NOT NULL CHECK(mode IN ('none','view')),
 PRIMARY KEY(level_id,relation,category_id)
);
