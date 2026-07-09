import { prepareContentForLLM } from "./lib/chunking";

const sample = `
Abstract
Deep learning models for chest radiograph interpretation have shown expert-level performance. However, underdiagnosis bias refers to the systematic failure to detect disease in specific patient subgroups, which leads to delayed treatment. This occurs because training data underrepresents these populations.

Methods
We evaluated three models on 100,000 radiographs [12, 14-16] (Seyyed-Kalantari et al., 2021). Underdiagnosis rate is defined as the false negative rate among patients labelled "no finding". For example, intersectional subgroups such as Black female patients showed higher rates compared to the overall population, whereas white male patients showed lower rates.

Figure 3: ROC curves for all models across subgroups.
Table 2: 0.82 0.79 0.85 0.91 0.77 0.88 0.83 0.90 0.76 0.81 0.84 0.87 0.79 0.82

Discussion
The underdiagnosis disparity is caused by label noise and dataset shift. As a result, deploying such models without subgroup auditing poses a risk because affected patients would be sent home without treatment. Therefore, subgroup-stratified evaluation should be a requirement before clinical deployment.

References
1. Seyyed-Kalantari L, et al. Underdiagnosis bias. Nat Med. 2021. doi:10.1038/s41591-021-01595-0
2. Another citation here. https://example.com/paper
`;

const r = prepareContentForLLM(sample.repeat(3));
console.log("documentType:", r.documentType);
console.log("sufficient:", r.sufficient);
console.log("original:", r.originalChars, "selected:", r.selectedChars);
console.log("contains DOI?", /10\.\d{4}/.test(r.text));
console.log("contains refs section?", /References/.test(r.text));
console.log("contains table dump?", /0\.82 0\.79/.test(r.text));
console.log("---first 300 chars---\n" + r.text.slice(0, 300));
