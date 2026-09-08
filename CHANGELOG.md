# Changelog

## [0.1.1](https://github.com/andrew310/jsonisch/compare/jsonisch-v0.1.0...jsonisch-v0.1.1) (2026-09-08)


### Features

* **conditionals:** when-clause accepts multiple values for choice fields (LOS-822) ([#691](https://github.com/andrew310/jsonisch/issues/691)) ([bcdaae6](https://github.com/andrew310/jsonisch/commit/bcdaae6940697c77800a73f00099cf4747aa7568))
* configurable record handle — one home on the store ([#2](https://github.com/andrew310/jsonisch/issues/2)) ([2f2d13c](https://github.com/andrew310/jsonisch/commit/2f2d13c475c9adfd29710e158a90dee45b6eca99))
* **derived:** LOS-567 PR B — write-path collapse, one derived-value writer ([4bb5d9b](https://github.com/andrew310/jsonisch/commit/4bb5d9b7385ef57f88a748179f24ff8257fe613d))
* **derived:** LOS-567 PR B — write-path collapse, one derived-value writer ([e402711](https://github.com/andrew310/jsonisch/commit/e402711c7db98f515f0e6bd762e8798aa48d8577))
* **jsonisch:** LOS-596 per-row companions — the tray estimate toggle works ([dbd9344](https://github.com/andrew310/jsonisch/commit/dbd9344c9e4f036343b82c60229639ac4f4919f3))
* **jsonisch:** LOS-602 v2 slice 1 — compiler-safe react adapter ([7a4e6ff](https://github.com/andrew310/jsonisch/commit/7a4e6ff068812b2aa806f47e97409ae7d98236cd))
* **jsonisch:** LOS-602 v2 slice 1 — compiler-safe react adapter (useSignalSnapshot, delete useSignals) ([670fb75](https://github.com/andrew310/jsonisch/commit/670fb7504f95c692215033ef05efb41525e5f180))
* **jsonisch:** persist envelopes as a kind-discriminated union ([8f4d759](https://github.com/andrew310/jsonisch/commit/8f4d75987da7bd4dd0090adcedb71a6622ce595a))
* **jsonisch:** plugin driver + nested envelope — the three passes become plugins (LOS-603, folds LOS-573) ([#537](https://github.com/andrew310/jsonisch/issues/537)) ([ad9a7c4](https://github.com/andrew310/jsonisch/commit/ad9a7c40d276d8ee17a20e69cb1f05bef1d3d3f9))
* **jsonisch:** plugin-owned react surface — fieldSnapshot + FieldStoreSlots augmentation (LOS-604) ([#545](https://github.com/andrew310/jsonisch/issues/545)) ([e2846dd](https://github.com/andrew310/jsonisch/commit/e2846ddb5cf1e7f0ededa2143884c834b01ccb82))
* **jsonisch:** scaffold @rwa/jsonisch — signal primitive, computed, useSignals (49 tests) ([22ba999](https://github.com/andrew310/jsonisch/commit/22ba999c4f49f202c0c0fc1c8e1938a80fa41186))
* **jsonisch:** v1a core store — JSON-Schema walk, three-input dirty model, x-column codec (LOS-542) ([099a327](https://github.com/andrew310/jsonisch/commit/099a3275b0b9ec9cd476ede6c66dd253234b95fa))
* **jsonisch:** v1b react adapter + registry + AJV routing — workflow-form-task pilot (LOS-546) ([9926209](https://github.com/andrew310/jsonisch/commit/99262097a7f5ff7a2f1b1a15c309a88fd7bea51e))
* **jsonisch:** v1c derivation core — computed formula signals, single scope path, calc-error channel (LOS-547) ([5560e94](https://github.com/andrew310/jsonisch/commit/5560e9400234afa704badc101dbe4edced5ac9e5))
* **jsonisch:** v1c derivation core — computed formula signals, single scope path, calc-error channel (LOS-547) ([f23772f](https://github.com/andrew310/jsonisch/commit/f23772fb3526be79f735ac9bc23f1c5973fc1f5a))
* **jsonisch:** v1d meta channel — Source/Hybrid companion decode/encode, real estimate mode, wrapper widgets (LOS-565) ([d4bd6cd](https://github.com/andrew310/jsonisch/commit/d4bd6cdbdc60aa11bfabac7a830a60cb3fedcfc9))
* **jsonisch:** v1e applyBaseline — rebase a live form on a fresh server record (LOS-566) ([2cd39b4](https://github.com/andrew310/jsonisch/commit/2cd39b45286183b51eb12bcbf8ba7c0137c184cb))
* **jsonisch:** v1e applyBaseline — rebase live form on fresh server record, in-flight edits survive (LOS-566) ([16f55f2](https://github.com/andrew310/jsonisch/commit/16f55f22e95cc83d95da0daecd7f5c4881bd42ce))
* **jsonisch:** v1f — loan stage form renders through jsonisch, calcEngine live (LOS-567 PR A) ([d900008](https://github.com/andrew310/jsonisch/commit/d9000083551d17ffdb9854ec790a1a389ad49c4e))
* **los-605:** jsonisch checks plugin — per-instance computed findings ([fbefc67](https://github.com/andrew310/jsonisch/commit/fbefc679116449a25db51b583af39bb8504e913c))
* **los-642:** rebuild edit-loan-sheet on the jsonisch host (slice 1) ([#540](https://github.com/andrew310/jsonisch/issues/540)) ([9dc73f2](https://github.com/andrew310/jsonisch/commit/9dc73f2e0f36ceecb18a5564a0f686f58d3c9aab))
* **los-823:** estimate fields — admin-configurable default mode ([#708](https://github.com/andrew310/jsonisch/issues/708)) ([ba15415](https://github.com/andrew310/jsonisch/commit/ba15415c21d0312897520881d64a9dd40c0ef442))
* **los-824:** amount-or-percent fields — default unit + 1B select ([#715](https://github.com/andrew310/jsonisch/issues/715)) ([0eb4ffd](https://github.com/andrew310/jsonisch/commit/0eb4ffd3deb06bd87a74d3700ec978cd37a57633))
* **los-835:** bagger() — one record in, both pockets derived ([#694](https://github.com/andrew310/jsonisch/issues/694)) ([328751d](https://github.com/andrew310/jsonisch/commit/328751d440968c899c3675f6d66b936a8f24ecb7))


### Bug Fixes

* **jsonisch:** adopt reset({ initialInput }) as one envelope ([4856aa6](https://github.com/andrew310/jsonisch/commit/4856aa67055ffcf48d02451b1ab9c32768903256))
* **jsonisch:** join applyBaseline rows by id when membership is clean ([4b06622](https://github.com/andrew310/jsonisch/commit/4b06622c6cfd98b6a29c97295b85bba0dfffc6e9))
* **jsonisch:** LOS-596 row-scoped derivation — delete the duplicate tray formula component ([3c4bd70](https://github.com/andrew310/jsonisch/commit/3c4bd70f2131fb98e9451359929bc32f7d1d1cd1))
* **jsonisch:** LOS-596 row-scoped derivation — delete the duplicate tray formula component ([e92b83b](https://github.com/andrew310/jsonisch/commit/e92b83b748ea4fbd853fa4619ebbe7988dbc9a4d))
* **jsonisch:** rebase every duplicate-id local row inside changed membership ([42651cd](https://github.com/andrew310/jsonisch/commit/42651cd41c17191111d4d7745e15bf0b5e5af699))
* **jsonisch:** share parkItemState and keep dirty rows the server dropped ([081044e](https://github.com/andrew310/jsonisch/commit/081044e24c2b55e022ec5b075f9847b8c89a7380))
* **los-605:** review — blank formula, loan handle, live instances ([6a2756c](https://github.com/andrew310/jsonisch/commit/6a2756c85df540bf8b2466476e50d5cb7260fad9))
* **los-708:** stage-form dirty matrix e2e + four dirty-path fixes ([#583](https://github.com/andrew310/jsonisch/issues/583)) ([9ff3ac7](https://github.com/andrew310/jsonisch/commit/9ff3ac794f3a73d54356fe31d3086f0c75f777ac))
* **los-722:** conditionals nest in groups, and stage forms + previews gate them from one source ([#584](https://github.com/andrew310/jsonisch/issues/584)) ([f516fff](https://github.com/andrew310/jsonisch/commit/f516fffc55ddf5681e2b81baac2aa4a75f78fb73))
* **los-819:** relation-tray conditionals gate even when the trigger is off the tray ([#683](https://github.com/andrew310/jsonisch/issues/683)) ([e330dcf](https://github.com/andrew310/jsonisch/commit/e330dcfcceb0fc32346043baab745e15884ea8eb))
* **los-857:** persist estimate default mode as formula | estimate ([#716](https://github.com/andrew310/jsonisch/issues/716)) ([e2eb42a](https://github.com/andrew310/jsonisch/commit/e2eb42a767a0d21de88fa2e159309fc45fcaa8df))
* **los-860:** scope Title Officer search to the selected Title Company ([7dd6665](https://github.com/andrew310/jsonisch/commit/7dd66656efd8b9b5b53d967e45af0cc182e3648e))


### Refactoring

* curate the export surface — root 56, jsonisch/plugin 32 ([#3](https://github.com/andrew310/jsonisch/issues/3)) ([b9ebadf](https://github.com/andrew310/jsonisch/commit/b9ebadfc6bef84b04426bd8b495b056b5619d743))
* drop the legacy schema dialect ([#5](https://github.com/andrew310/jsonisch/issues/5)) ([#13](https://github.com/andrew310/jsonisch/issues/13)) ([5b636a6](https://github.com/andrew310/jsonisch/commit/5b636a6130228b83135d72c2452512b2f2af6ac3))
* **jsonisch:** rename companions plugin to envelopes ([d36f5f2](https://github.com/andrew310/jsonisch/commit/d36f5f2a623f8126417a4f3030c6c4cd47360bb1))
* recordHandle → rootRecordAlias ([54864eb](https://github.com/andrew310/jsonisch/commit/54864ebb2d45758e11521e192db35234f5018c2f))
* settled field-kind vocabulary — Hybrid*/Source* renamed ([#4](https://github.com/andrew310/jsonisch/issues/4)) ([#12](https://github.com/andrew310/jsonisch/issues/12)) ([d1a6333](https://github.com/andrew310/jsonisch/commit/d1a6333d784b0b32094be2844e90d54aaadcbeac))


### Documentation

* best-of-three names three real lineages ([#18](https://github.com/andrew310/jsonisch/issues/18)) ([fc6894e](https://github.com/andrew310/jsonisch/commit/fc6894e9149ee0e8fd02869a3c8bc67dfddc7d07))
* **jsonisch:** narrow writeEnvelope writer invariant ([401e9f0](https://github.com/andrew310/jsonisch/commit/401e9f082dcb7b152b4f4f7411ac868e5c71b4f2))
* **jsonisch:** README — form-library prior art + where jsonisch fits (signals, TanStack composition, JSON-Schema) ([#468](https://github.com/andrew310/jsonisch/issues/468)) ([357927d](https://github.com/andrew310/jsonisch/commit/357927dfe921f83c9001ef4d5cbb17319042eb2d))
* lineage section states what we actually studied ([#19](https://github.com/andrew310/jsonisch/issues/19)) ([3e70c2c](https://github.com/andrew310/jsonisch/commit/3e70c2c6c249fc599bc7ab61f09e79f5537e5a82))
* logo in the README ([#17](https://github.com/andrew310/jsonisch/issues/17)) ([0191401](https://github.com/andrew310/jsonisch/commit/0191401ca22c7410f9ec08061955540f63d0a406))
* **los-638:** sweep the docs graveyard; verify-and-sweep the checklists; seed jsonisch architecture pages ([#541](https://github.com/andrew310/jsonisch/issues/541)) ([0bd3984](https://github.com/andrew310/jsonisch/commit/0bd39843601aceff6c21119ba0ceb779e8a0615c))
* reposition README around schemas-as-values ([#14](https://github.com/andrew310/jsonisch/issues/14)) ([#16](https://github.com/andrew310/jsonisch/issues/16)) ([00f5d08](https://github.com/andrew310/jsonisch/commit/00f5d08035bdcac4e91a28e38ef8a93f46106053))
* the agent angle — a schema an LLM just wrote is a form ([#22](https://github.com/andrew310/jsonisch/issues/22)) ([dd7c1d4](https://github.com/andrew310/jsonisch/commit/dd7c1d450500f8493f110493038519ea4a6a7dbb))

## 0.1.0

First public release. Extracted from the RWA platform with history intact.

Experimental: the API is in use in production there, but is not frozen.
