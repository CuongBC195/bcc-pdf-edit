import React from 'react';

type LazyTool = React.LazyExoticComponent<React.ComponentType>;

const fromModule = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): LazyTool =>
  React.lazy(async () => ({ default: (await load())[name] as React.ComponentType }));

const mergeSplit = () => import('./tools/mergeSplit');
const pageOps = () => import('./tools/pageOps');
const layout = () => import('./tools/layout');

/** id công cụ -> component (tải lười theo nhóm) */
export const PDF_TOOL_COMPONENTS: Record<string, LazyTool> = {
  'merge-pdf': fromModule(mergeSplit, 'MergePdf'),
  'split-pdf': fromModule(mergeSplit, 'SplitPdf'),
  'extract-pages': fromModule(mergeSplit, 'ExtractPages'),
  'alternate-merge': fromModule(mergeSplit, 'AlternateMerge'),
  'duplex-collate': fromModule(mergeSplit, 'DuplexCollate'),
  'overlay-pdf': fromModule(mergeSplit, 'OverlayPdf'),
  'pdf-to-zip': fromModule(mergeSplit, 'PdfToZip'),
  'pdf-multi-tool': fromModule(pageOps, 'PdfMultiTool'),
  'organize-pdf': fromModule(pageOps, 'OrganizePdf'),
  'delete-pages': fromModule(pageOps, 'DeletePages'),
  'add-blank-page': fromModule(pageOps, 'AddBlankPage'),
  'remove-blank-pages': fromModule(pageOps, 'RemoveBlankPages'),
  'reverse-pages': fromModule(pageOps, 'ReversePages'),
  'rotate-pdf': fromModule(pageOps, 'RotatePdf'),
  'rotate-custom': fromModule(pageOps, 'RotateCustom'),
  'divide-pages': fromModule(pageOps, 'DividePages'),
  'combine-single-page': fromModule(pageOps, 'CombineSinglePage'),
  'crop-pdf': fromModule(layout, 'CropPdf'),
  'n-up-pdf': fromModule(layout, 'NUpPdf'),
  'pdf-booklet': fromModule(layout, 'PdfBooklet'),
  'posterize-pdf': fromModule(layout, 'PosterizePdf'),
  'fix-page-size': fromModule(layout, 'FixPageSize'),
  'page-dimensions': fromModule(layout, 'PageDimensions'),
};

