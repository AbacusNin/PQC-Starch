import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {survey, controls, tests} from '../web/content.js';
import {normalizeAssessment} from '../web/storage.js';
import {buildScorecard} from '../web/scorecard.js';
import {buildCycloneDxDraft} from '../web/attestation.js';

// Every organization, product, test observation, and proof item below is fictional.
// This fixture shows record linkage and review decisions. It is not a vendor assessment.
const date='2026-10-09';
const product='HarborLink OT Edge Gateway (fictional example)';
const version='4.2.0-demo / HL-EG-420-LAB';
const setup='Fictional municipal water lab: 12 bench gateways, two test pump controllers, one staging broker, admin console, and offline recovery bench. No production fleet tested.';
// Usage: node examples/build_fictional_example.mjs [output directory]
const out=path.resolve(process.argv[2]||'examples/output')+path.sep;
await mkdir(out,{recursive:true});

const buyer={
  organization:'Bluewater Municipal Utility (fictional training buyer)',product,version,
  configuration:setup,vendor:'HarborLink Systems (fictional training vendor)',
  reviewer:'Buyer review team (fictional): procurement, OT operations, security, PKI, and legal',
  setting:'Commercial / campus',dataLife:'Telemetry: 7 years; credentials and firmware trust: through device service life plus 5 years.',
  targetDate:'2027-02-01',policyRef:'ILLUSTRATIVE buyer clause PQC-OT-01 rev A. Apply no federal or NSS deadline without separate policy review.',
  assessmentDate:date,decision:'Conditional',
  verified:'SYNTHETIC EXERCISE ONLY. On the fictional 4.2.0-demo lab build, the sample trace records hybrid X25519MLKEM768 on the admin-console to gateway TLS 1.3 path. Separate sample traces show certificate validation, disallowed fallback, internal mTLS, firmware integrity checks, and a classical cloud-broker leg. The sample CBOM and SBOM are inventory inputs, not proof of live use.',
  unknown:'No production fleet trace; no independent second-implementation result; no validated-module claim; no formal PQCMM level; no verified BOM signature; no completed constrained-device update/recovery or mixed-version rollout test. Gateway-to-broker TLS, SSH, IKEv2, and firmware/boot signatures remain classical in this scenario.',
  conditions:'Training decision only. Before a real purchase: close AC-001 through AC-008; complete T06, T08, T10, T13, T20, T24, T27, T29, T31, and XT-001 as applicable; obtain authentic supplier proof for the exact release; have procurement and OT safety owners sign the exception or revise the requirements.',
  trigger:'Reassess at release 4.3, a crypto library or certificate-chain change, new cloud transport, fleet rollout, changed contract terms, or an applicable buyer policy update.'
};

const S=[
  ['Yes','The offered sample is 4.2.0-demo, SKU HL-EG-420-LAB, with the bench configuration listed in the buyer record.',''],
  ['Partial','Hybrid TLS is enabled for admin-console access in the lab. Cloud telemetry and device management still use classical public-key methods.','AC-001: identify the release and entitlement for every remaining path.'],
  ['Partial','The packet maps to the lab configuration; it does not cover the 120-device production design.','AC-003: replay on a representative fleet segment.'],
  ['No','The supplier makes no formal PQCMM level claim for this release.','Do not infer a level from this workbook.'],
  ['N/A','No PQCMM assessment or assessor report was supplied.','Request one only if the supplier later makes a level claim.'],
  ['No','There is no criterion-by-criterion PQCMM evidence matrix.','AC-007: request a versioned matrix if a maturity claim enters procurement.'],
  ['Partial','A dated transition roadmap lists open paths and owners; dates are supplier targets, not tested delivery.','AC-001: convert roadmap items to contract milestones.'],
  ['Partial','CBOM and manual map cover the lab TLS, mTLS, SSH, IPsec, firmware, boot, backup, and PKI paths. Radio maintenance and fleet variants remain unobserved.','AC-003: reconcile discovery with fleet configuration and traces.'],
  ['Yes','The sample SBOM names the gateway image and two illustrative software components.','Check actual supplier SBOM completeness and versions before procurement.'],
  ['Yes','The supplier names discovery blind spots: disabled plugins, dormant crypto, recovery ROM, and maintenance uplink.','AC-003: test those gaps on representative equipment.'],
  ['Yes','The lab admin path reports ML-KEM-768 in a hybrid TLS group. No PQC signature is claimed.','Replay group negotiation on the offered build.'],
  ['No','No draft algorithm name or draft wire identifier is claimed in the sample release note.','Verify OIDs and group IDs against the final release artifact.'],
  ['Partial','Only admin-console to gateway TLS is shown using hybrid key establishment. Internal mTLS is configured for hybrid in the lab; broker and VPN legs remain classical.','AC-001: provide a path-by-path transition plan.'],
  ['Yes','The sample full-handshake trace reports X25519MLKEM768 as the selected TLS group for CU-001.','Repeat independently and test resumption.'],
  ['Yes','Classical-only peers are rejected on the strict admin listener; the compatibility listener still permits classical negotiation by design.','Keep strict and compatibility listeners distinct in the fleet plan.'],
  ['Yes','The lab policy can require the hybrid group on the admin listener.','Confirm that the production image retains this control.'],
  ['Yes','The lab server certificate chain and hostname were checked; internal mTLS identities are a separate path.','AC-002: complete client-certificate negative test.'],
  ['No','Identity certificates and update signatures are classical in this release; hybrid key exchange does not change that.','Track signature migration separately.'],
  ['Yes','Firmware and boot images carry ECDSA P-384 signatures in the sample flow. Recovery-image verification remains incomplete.','AC-004: complete recovery rejection and trust-anchor rotation tests.'],
  ['Partial','A software update can change TLS group policy; boot ROM and recovery trust-anchor replacement are not demonstrated.','AC-004: obtain a safe device-level migration procedure.'],
  ['No','No CAVP certificate is claimed for the fictional implementation.','Do not list an algorithm certificate until exact version and implementation match.'],
  ['No','No CMVP validated-module claim is made for this deployment.','Do not imply FIPS validation from an algorithm name or TLS trace.'],
  ['Partial','The buyer lab replay uses one peer stack. An independent second-implementation report is pending.','AC-005: obtain a partner/version matrix and run T08.'],
  ['Partial','Sample bench measurements cover handshake size and latency, not radio links or peak fleet load.','AC-006: measure constrained and representative network paths.'],
  ['Partial','A written algorithm-change procedure exists; rollback across mixed fleet versions was not tested.','AC-006: run T10 and T29.'],
  ['Yes','The fictional support schedule names a disclosure inbox, update owner, and 2029 maintenance end date.','Bind these terms in the final contract.'],
  ['Partial','Admin hybrid TLS is in the sample entitlement; cloud-path PQC and fleet support terms are unresolved.','AC-008: record exact license and upgrade rights.'],
  ['Yes','The roadmap has named engineering owners and tentative 4.3/4.4 milestones.','Treat dates as proposals until a purchase agreement names remedies.'],
  ['N/A','The fictional vendor does not claim federal or NSS readiness for this municipal buyer.','Recheck if buyer setting changes.'],
  ['N/A','No NSS or CSfC claim is made.','Never infer CNSA 2.0 compliance from the hybrid TLS result.'],
  ['Yes','The sample change policy calls for reassessment after crypto library, certificate, major build, configuration, or incident changes.','Add a contract notice obligation.'],
  ['Yes','The exercise uses redacted local artifacts and a proposed controlled portal. No keys or production packet captures are included.','Approve retention and sharing rules before real evidence intake.'],
  ['Partial','The sample SBOM lists two direct dependencies; downstream PQC assessment is unfinished.','AC-007: get supplier coverage and sub-tier gaps.'],
  ['Partial','A fictional product owner is named, but there is no independently verifiable signed attestation.','AC-007: request signed release-scoped responses.'],
  ['Partial','A sample SBOM and CBOM identify release 4.2.0-demo. Their declared inventory is partial around recovery ROM and maintenance uplink.','AC-003: obtain complete release artifacts and gap statement.'],
  ['Partial','The sample BOMs declare a generation process and pass a local schema check. No trusted supplier signature is available.','AC-007: verify provenance and signature through a trusted channel.'],
  ['Partial','The CBOM lists ML-KEM-768, but only CU-001 has a corresponding sample observed trace. The cloud and VPN paths remain classical.','Do not turn a provided algorithm into a deployed-use claim.'],
  ['Yes','The exercise lists the fictional appliance agreement, a synthetic component notice, and the CycloneDX schema/license boundary.','AC-008: obtain binding redistribution and test rights.']
];
if(S.length!==survey.length)throw new Error(`Survey mismatch ${S.length}/${survey.length}`);
const qid=n=>`Q${String(n).padStart(2,'0')}`;
const surveyState={};
for(let i=0;i<S.length;i++){
  const [answer,detail,followup]=S[i];
  surveyState[qid(i+1)]={answer,detail:`SYNTHETIC VENDOR RESPONSE: ${detail}`,
    review:answer==='Yes'&&![7,8,9,10,23,26,28,31,32,38].includes(i+1)?'Accepted':
      answer==='N/A'||answer==='No'?'Accepted':'Clarify',followup};
}

const cryptoSpecs=[
  ['CU-001','Admin browser to gateway','admin browser','gateway admin listener','Key establishment','TLS 1.3 X25519MLKEM768 hybrid','ML-KEM-768 + X25519','gateway TLS stack 4.2.0-demo','cbom-mlkem','Observed','Keep hybrid required on strict admin listener.'],
  ['CU-002','Gateway to cloud telemetry broker','gateway','staging broker','Key establishment','TLS 1.3 X25519','X25519','gateway MQTT client 4.2.0-demo','cbom-x25519','Observed','Target hybrid after broker compatibility and radio budget test.'],
  ['CU-003','Gateway to internal policy service','gateway','policy service','Client authentication','TLS 1.3 mTLS with X25519MLKEM768; ECDSA P-384 certificates','ML-KEM-768 + X25519','gateway TLS stack 4.2.0-demo','cbom-mlkem','Observed','Migrate certificate signatures separately.'],
  ['CU-004','Firmware package integrity','release signer','gateway updater','Firmware signing','ECDSA P-384 / SHA-384','P-384','firmware verifier 4.2.0-demo','cbom-ecdsa','Observed','Plan ML-DSA signing and dual-verification transition.'],
  ['CU-005','Secure boot image integrity','boot ROM','gateway image','Boot verification','ECDSA P-384 / SHA-384','P-384','boot verifier 4.2.0-demo','cbom-ecdsa','Observed','ROM replacement and recovery trust path require review.'],
  ['CU-006','Local telemetry archive','gateway storage','gateway storage','Data encryption','AES-256-GCM','256-bit key','storage service 4.2.0-demo','cbom-aes','Observed','Review key wrapping and archive life separately.'],
  ['CU-007','Maintenance SSH','operator workstation','gateway SSH listener','Server authentication','SSH X25519 key exchange; Ed25519 host key','X25519 / Ed25519','SSH service 4.2.0-demo','cbom-ssh','Observed','No PQC migration proof for the SSH path.'],
  ['CU-008','Maintenance IPsec tunnel','field router','gateway VPN listener','Key establishment','IKEv2 classical ECDH group 19','group 19','VPN service 4.2.0-demo','cbom-ipsec','Vendor claim','Capture tunnel negotiation on representative field routers.'],
  ['CU-009','Device certificate lifecycle','test CA','gateway identity store','Certificate issuance','ECDSA P-384 certificate issuance and renewal','P-384','lab CA workflow rev A','cbom-cert','Observed','Plan a separate PQC identity and chain-size assessment.'],
  ['CU-010','Recovery image verification','recovery media','gateway recovery ROM','Firmware signing','ECDSA P-384 recovery image signature','P-384','recovery ROM rev 2','cbom-ecdsa','CBOM listed','Trusted and tampered recovery paths remain untested.']
];
const crypto=cryptoSpecs.map(([id,path,sourceNode,destinationNode,fn,current,parameter,component,cbomRef,usageStatus,target])=>({
  id,product,protected:path,path,sourceNode,destinationNode,trustBoundary:sourceNode===destinationNode?'Local protected storage':`${sourceNode} to ${destinationNode}`,
  function:fn,current,parameter,protocolVersion:current.includes('TLS')?'TLS 1.3':current.includes('IKE')?'IKEv2':'As recorded',
  cipherSuite:current.includes('TLS')?'TLS_AES_256_GCM_SHA384':'See linked synthetic proof',component,
  componentPurl:'',sbomRef:id==='CU-001'||id==='CU-003'?'pkg:generic/harborlink-tls@4.2.0-demo':'',cbomRef,
  assetType:current.includes('TLS')?'protocol':'algorithm',usageStatus,
  keyLifecycle:id==='CU-006'?'Lab key rotation every 90 days; custody ID only.':'See EV-110 for sample certificate/key lifecycle; no secret values stored.',
  owner:id==='CU-004'||id==='CU-005'||id==='CU-010'?'Firmware engineering (fictional)':'OT platform security (fictional)',
  dataLife:buyer.dataLife,target,
  coverage:`SYNTHETIC LAB SCOPE. ${id==='CU-001'?'Full handshake trace and policy replay only.':id==='CU-010'?'Inventory listing only; no recovery execution.':'No production fleet claim.'} Blind spots: dormant features, field radio conditions, and versions outside 4.2.0-demo.`
}));

const cbom={bomFormat:'CycloneDX',specVersion:'1.7',serialNumber:'urn:uuid:11111111-2222-4333-8444-555555555551',version:1,
  metadata:{timestamp:'2026-10-08T12:00:00Z',component:{type:'application',name:product,version}},
  components:[
    {type:'cryptographic-asset','bom-ref':'cbom-mlkem',name:'ML-KEM-768',cryptoProperties:{assetType:'algorithm',algorithmProperties:{primitive:'kem'}}},
    {type:'cryptographic-asset','bom-ref':'cbom-x25519',name:'X25519',cryptoProperties:{assetType:'algorithm',algorithmProperties:{primitive:'key-agree'}}},
    {type:'cryptographic-asset','bom-ref':'cbom-ecdsa',name:'ECDSA P-384',cryptoProperties:{assetType:'algorithm',algorithmProperties:{primitive:'signature'}}},
    {type:'cryptographic-asset','bom-ref':'cbom-aes',name:'AES-256-GCM',cryptoProperties:{assetType:'algorithm',algorithmProperties:{primitive:'ae'}}},
    {type:'cryptographic-asset','bom-ref':'cbom-ssh',name:'SSH',cryptoProperties:{assetType:'protocol',protocolProperties:{type:'ssh'}}},
    {type:'cryptographic-asset','bom-ref':'cbom-ipsec',name:'IKEv2/IPsec',cryptoProperties:{assetType:'protocol',protocolProperties:{type:'ike'}}},
    {type:'cryptographic-asset','bom-ref':'cbom-cert',name:'Lab device certificate',cryptoProperties:{assetType:'certificate'}}
  ],compositions:[{aggregate:'incomplete',assemblies:['cbom-mlkem','cbom-x25519','cbom-ecdsa','cbom-aes','cbom-ssh','cbom-ipsec','cbom-cert']}]
};
const sbom={bomFormat:'CycloneDX',specVersion:'1.7',serialNumber:'urn:uuid:11111111-2222-4333-8444-555555555552',version:1,
  metadata:{timestamp:'2026-10-08T12:00:00Z',component:{type:'firmware',name:product,version}},
  components:[
    {type:'library','bom-ref':'pkg:generic/harborlink-tls@4.2.0-demo',name:'harborlink-tls',version:'4.2.0-demo'},
    {type:'library','bom-ref':'pkg:generic/harborlink-updater@4.2.0-demo',name:'harborlink-updater',version:'4.2.0-demo'}
  ],compositions:[{aggregate:'incomplete',assemblies:['pkg:generic/harborlink-tls@4.2.0-demo','pkg:generic/harborlink-updater@4.2.0-demo']}]
};
const boms=[
  {id:'BM-001',kind:'SBOM',serial:sbom.serialNumber,version:'1',target:product,release:version,supplier:buyer.vendor,author:'Fictional supplier build pipeline',created:'2026-10-08',lifecycle:'Build',tool:'Synthetic fixture writer 1.0',source:'EV-106',validation:'Local CycloneDX 1.7 schema check on synthetic fixture',signature:'Not verified; no trusted supplier signature',composition:'Incomplete: recovery ROM and maintenance uplink excluded',services:'Staging broker is external to the gateway image.',dependencies:'Two illustrative direct components only; no full transitive coverage.',distribution:'Public synthetic training artifact; no real architecture or keys.',reviewer:'Fictional buyer review team',notes:'SYNTHETIC. A valid schema does not prove completeness, origin, or deployed use.'},
  {id:'BM-002',kind:'CBOM',serial:cbom.serialNumber,version:'1',target:product,release:version,supplier:buyer.vendor,author:'Fictional supplier build pipeline',created:'2026-10-08',lifecycle:'Build',tool:'Synthetic fixture writer 1.0',source:'EV-105',validation:'Local CycloneDX 1.7 schema check on synthetic fixture',signature:'Not verified; no trusted supplier signature',composition:'Incomplete: listed assets do not cover all runtime paths',services:'Admin TLS, internal mTLS, broker TLS, SSH, and IKEv2 need path reconciliation.',dependencies:'ML-KEM-768 is listed as provided. Only CU-001 has a sample observed buyer path.',distribution:'Public synthetic training artifact; no secret material.',reviewer:'Fictional buyer review team',notes:'SYNTHETIC. Do not treat listed crypto as observed use.'}
];

const files=new Map([
 ['EV-101',['harborlink-demo-release-scope.txt',`SYNTHETIC TRAINING EXAMPLE. No real vendor or product.\nProduct: ${product}\nRelease: ${version}\nSetup: ${setup}\nAdmin hybrid TLS is a lab feature. Cloud telemetry, SSH, IPsec, and signatures remain classical.\nNo PQCMM, CAVP, CMVP, federal, or NSS conformance claim is made.\n`]],
 ['EV-102',['admin-hybrid-tls-lab-trace.txt','SYNTHETIC TRAINING TRACE, NOT A REAL PACKET CAPTURE.\nCU-001: full TLS 1.3 handshake. Offered: X25519MLKEM768, X25519. Selected: X25519MLKEM768. Certificate: ECDSA P-384. Hostname and chain accepted; wrong-name lab certificate rejected. Build: 4.2.0-demo. Buyer lab observer: fictional.\n']],
 ['EV-103',['admin-fallback-negative-controls.txt','SYNTHETIC TRAINING TRACE. Strict admin listener rejects classical-only and unsupported-group peers. Compatibility listener accepts classical X25519 by written policy. No conclusion about other network paths.\n']],
 ['EV-104',['internal-mtls-lab-trace.txt','SYNTHETIC TRAINING TRACE. Gateway to policy service: TLS 1.3, X25519MLKEM768 selected, ECDSA P-384 identities. Wrong-name and expired test certificates rejected. Client-auth revocation case pending.\n']],
 ['EV-105',['harborlink-demo-cbom.json',JSON.stringify(cbom,null,2)]],
 ['EV-106',['harborlink-demo-sbom.json',JSON.stringify(sbom,null,2)]],
 ['EV-107',['firmware-integrity-lab-log.txt','SYNTHETIC TRAINING LOG. Firmware image signed with ECDSA P-384 accepted on 4.2.0-demo; byte-changed image rejected. Boot image accepted and tampered image rejected. Recovery image and trust-anchor rotation not tested.\n']],
 ['EV-108',['support-and-entitlement-summary.txt','SYNTHETIC CONTRACT SUMMARY. Maintenance ends 2029-12-31. Admin hybrid TLS is included in example subscription. Fleet migration rights, broker PQC entitlement, and recovery upgrade rights require final contract review. Fictional disclosure owner: Product Security.\n']],
 ['EV-109',['bench-performance.txt','SYNTHETIC BENCH RESULT. 12 gateways; median full handshake 41 ms; 95th percentile 68 ms; full-handshake flight 3.4 KB; sample network MTU 1500. The lab proxy accepted fragmented records. No field radio or production fleet was measured. This is illustrative data, not a vendor benchmark.\n']],
 ['EV-110',['key-lifecycle-lab-log.txt','SYNTHETIC LAB LOG. Device certificate issued, renewed, expired certificate rejected, and revoked certificate rejected in the staging CA. Key values and private material are omitted. Recovery anchor rotation is not covered.\n']],
 ['EV-111',['release-crypto-diff.txt','SYNTHETIC TRAINING DIFF. Compared fictional 4.1-demo and 4.2.0-demo manifests. New: ML-KEM-768 listed, admin listener hybrid configuration, revised TLS library. Unchanged: classical broker TLS, SSH, IKEv2, ECDSA firmware/boot signing. Recovery ROM missing from both inventories. Trigger reassessment for library, protocol, certificate, and configuration changes.\n']],
 ['EV-112',['buyer-test-plan.txt','SYNTHETIC BUYER TEST PLAN. Acceptance owner: fictional procurement and OT safety leads. 26 tests are marked required for this training purchase. Ten remain blocked by peer access, fixture, maintenance window, or safety prerequisites. Blocked tests need an explicit disposition before any real purchase. This plan is not a real approval.\n']],
 ['EV-116',['discovery-reconciliation.txt','SYNTHETIC RECONCILIATION. Compared sample CBOM assets with lab configuration and trace IDs CU-001 through CU-010. ML-KEM-768 is listed, and only CU-001/CU-003 have sample path traces. Recovery ROM, dormant plugins, and field uplinks remain blind spots.\n']],
 ['EV-117',['license-notice.txt','SYNTHETIC LICENSE NOTICE. Fictional appliance evaluation terms permit a 12-device lab replay. Production, redistribution, and fleet upgrade rights remain subject to a signed order. The sample BOM syntax references CycloneDX material; verify upstream license terms before publishing derived content.\n']],
 ['EV-119',['harborlink-demo-broker-tls-trace.txt','SYNTHETIC TRAINING TRACE. This is not a real packet capture or supplier result.\nProduct: HarborLink OT Edge Gateway (fictional example)\nBuild: 4.2.0-demo / HL-EG-420-LAB\nPath CU-002: lab gateway to staging telemetry broker\nProtocol: TLS 1.3\nOffered groups: X25519\nSelected group: X25519\nIdentity check: example ECDSA P-384 broker certificate chain and hostname accepted\nNegative control: wrong-name broker certificate rejected\nLimit: no field router, radio link, production broker, or fleet version was tested.\nBuyer observation: this path remains classical; it must not inherit the hybrid status of CU-001.\n']]
]);
// The firmware bench log records the buyer's own bench run, so the buyer lab produced it.
const BUYER_PROOF=['EV-102','EV-103','EV-104','EV-107','EV-109','EV-110','EV-112','EV-116','EV-119'];
const evidence=[];
for(let i=1;i<=survey.length;i++){
  const id=qid(i),a=surveyState[id];
  evidence.push({id:`EV-${String(i).padStart(3,'0')}`,linkedIds:[id],type:'Vendor statement',
    producer:'Supplier',artifact:`SYNTHETIC supplier answer to ${id}`,issuer:'HarborLink Systems (fictional)',date,
    productMatch:'Unsure',pathMatch:'Unsure',location:'',result:'Not reviewed',sensitivity:'Public',
    note:'Auto-created style supplier statement. The answer alone is not independent proof.',
    originQuestion:id,supplierAnswer:a.answer,supplierDetail:a.detail});
}
const E=[
 ['EV-101','Release scope and configuration note','Product documentation','Accepted','Yes','Yes',['Q01','Q02','Q03','Q11','Q12','Q18','Q21','Q22','Q29','Q30','C01','C04','T17','T32','CU-001']],
 ['EV-102','Buyer lab admin TLS full-handshake trace','Test trace','Accepted','Yes','Yes',['Q13','Q14','Q16','C05','T01','T04','T11','T15','T17','CU-001']],
 ['EV-103','Strict/compatibility listener negative-control trace','Test trace','Accepted','Yes','Yes',['Q15','C07','T02','T03','T15','T27','CU-001']],
 ['EV-104','Internal service mTLS and identity trace','Test trace','Accepted','Yes','Yes',['Q17','C05','T05','T12','T30','CU-003']],
 ['EV-105','Partial sample CycloneDX 1.7 CBOM','CBOM / inventory','Clarify','Yes','Unsure',['Q08','Q10','Q35','Q36','Q37','C03','C09','C19','C20','T13','T18','CU-001','CU-008','CU-010']],
 ['EV-106','Partial sample CycloneDX 1.7 SBOM','CBOM / inventory','Accepted','Yes','Yes',['Q09','Q35','C09','C19','T13','T26','BM-001']],
 ['EV-107','Firmware and boot integrity lab log','Test trace','Accepted','Yes','Yes',['Q19','C08','T07','T24','CU-004','CU-005']],
 ['EV-108','Support and entitlement summary','Contract / roadmap','Accepted','Yes','Yes',['Q26','Q27','Q28','Q31','C14','C15','C18','T17']],
 ['EV-109','Bench handshake-size and latency report','Test trace','Accepted','Yes','Yes',['Q24','C12','T09','T33','CU-001']],
 ['EV-110','Staging certificate lifecycle log','Test trace','Accepted','Yes','Yes',['Q20','Q32','C17','C21','T14','T23','CU-009']],
 ['EV-111','Two-build crypto inventory diff','Assessment report','Accepted','Yes','Yes',['Q31','C18','T26','CU-001']],
 ['EV-112','Buyer required-test plan and owners','Assessment report','Accepted','Yes','Yes',['Q23','Q28','C23','T29','T31','XT-001']],
 ['EV-113','Production entitlement and contract amendment','Contract / roadmap','Not reviewed','Unsure','Unsure',['Q27','Q38','C15','C22','AC-008']],
 ['EV-114','Independent second-implementation report','Independent test','Not reviewed','Unsure','Unsure',['Q23','C12','C24','T08','AC-005']],
 ['EV-115','Constrained-device update and recovery result','Test trace','Not reviewed','Unsure','Unsure',['Q19','Q20','C26','T24','T31','XT-001','AC-004']],
 ['EV-116','Buyer discovery and CBOM reconciliation','Assessment report','Accepted','Yes','Yes',['Q08','Q10','C03','C20','T16','T18','CU-001']],
 ['EV-117','Example product and content license notice','Product documentation','Accepted','Yes','Yes',['Q38','C22','LI-001','LI-002','LI-003']],
 ['EV-118','Prior-release TLS trace excluded from 4.2.0 claim','Test trace','Rejected','No','No',['Q14','C05','T01','CU-001']],
 ['EV-119','gateway-to-broker classical TLS lab trace','Test trace','Accepted','Yes','Yes',['Q13','C03','CU-002','T16']]
];
for(const [id,artifact,type,result,productMatch,pathMatch,linkedIds] of E){
  const attachment=files.get(id);
  evidence.push({id,linkedIds,type,artifact:`SYNTHETIC: ${artifact}`,issuer:BUYER_PROOF.includes(id)?'Fictional buyer lab':'HarborLink Systems (fictional)',producer:BUYER_PROOF.includes(id)?'Buyer':'Supplier',
    date,productMatch,pathMatch,location:attachment?`Embedded example file: ${attachment[0]}`:'Example evidence packet / pending or reviewer note',
    result,sensitivity:'Public',note:id==='EV-118'?'Older build and wrong setup: deliberate scope mismatch.':'Training artifact only. No real supplier assertion or test occurred.',
    attachmentName:attachment?.[0]||'',attachmentType:attachment?.[0].endsWith('.json')?'application/json':attachment?'text/plain':'',
    attachmentSize:attachment?Buffer.byteLength(attachment[1]):0});
}
const attachments=[...files].map(([id,[name,body]])=>{
  const type=name.endsWith('.json')?'application/json':'text/plain';
  return {id,name,type,size:Buffer.byteLength(body),dataUrl:`data:${type};base64,${Buffer.from(body).toString('base64')}`};
});

const controlState={};
const status={C01:'Accepted',C02:'Gap',C03:'Clarify',C04:'Clarify',C05:'Accepted',C06:'Clarify',C07:'Accepted',C08:'Gap',C09:'Clarify',C10:'N/A',C11:'N/A',C12:'Gap',C13:'Gap',C14:'Clarify',C15:'Clarify',C16:'N/A',C17:'Accepted',C18:'Clarify',C19:'Clarify',C20:'Clarify',C21:'Accepted',C22:'Accepted',C23:'Gap',C24:'Gap',C25:'Gap',C26:'Gap'};
const controlGap={C02:'No formal PQCMM claim or criterion matrix; AC-007.',C03:'Fleet and recovery blind spots; AC-003.',C04:'AC-005, AC-006; T10, T27',C06:'Client-certificate negative test blocked; AC-002 / T06.',C08:'Recovery verification and future signing migration absent; AC-004.',C09:'CBOM provenance and exact component relationships need review; AC-007.',C12:'Independent interop and field performance missing; AC-005 / AC-006.',C13:'Mixed-version rollback not exercised; AC-006.',C14:'Support terms are supplier-documented; T26 needs a buyer-produced release comparison before acceptance.',C15:'Fleet entitlement and upgrade rights unresolved; AC-008.',C18:'Sub-tier suppliers incomplete; AC-007.',C19:'BOMs partial and unsigned; AC-003 / AC-007.',C20:'Listed assets exceed observed buyer paths; AC-003.',C23:'Required tests T06, T08, T10, T13, T20, T24, T27, T29, T31, XT-001 unresolved; owners assigned.',C24:'No independent release-scoped assurance report; AC-005 / AC-007.',C25:'Fleet variants and mixed-version path blocked; AC-003 / AC-006.',C26:'Representative constrained-device update/recovery not run; AC-004.'};
for(const [id] of controls){
  controlState[id]={applies:status[id]==='N/A'?'No':'Yes',result:status[id],gapAction:controlGap[id]||'',
    ownerTeam:['C08','C26'].includes(id)?'OT safety and firmware engineering (fictional)':id==='C15'||id==='C22'?'Procurement and legal (fictional)':'Buyer security review (fictional)',
    rationale:id==='C04'?'The sample release note names ML-KEM-768, but buyer-required algorithm-change and KEM failure tests T10 and T27 remain blocked. Keep this control open until those tests and authentic release-scoped proof are reviewed.':status[id]==='Accepted'?'Synthetic lab record has linked, dated, scope-matched example proof. Recheck with authentic supplier evidence in a real purchase.':status[id]==='N/A'?'No federal/NSS or validation claim applies in this fictional municipal scenario; revisit if policy or claims change.':'The linked action and test gate remain unresolved in this training scenario.'};
}

const testUse={T01:'CU-001',T02:'CU-001',T03:'CU-001',T04:'CU-001',T05:'CU-003',T06:'CU-003',T07:'CU-004',T08:'CU-001',T09:'CU-001',T10:'CU-001',T11:'CU-001',T12:'CU-003',T13:'CU-001',T14:'CU-009',T15:'CU-001',T16:'CU-001',T17:'CU-001',T18:'CU-001',T19:'CU-007',T20:'CU-008',T21:'CU-006',T22:'CU-006',T23:'CU-009',T24:'CU-010',T25:'CU-005',T26:'CU-001',T27:'CU-001',T28:'CU-001',T29:'CU-001',T30:'CU-003',T31:'CU-010',T32:'CU-001',T33:'CU-001','XT-001':'CU-008'};
const observed=new Set(['T01','T02','T03','T04','T05','T07','T09','T12','T14','T15','T16','T17','T18','T23','T26','T30','T33']);
const blocked=new Set(['T06','T08','T10','T13','T20','T24','T27','T29','T31','XT-001']);
const notApplicable=new Set(['T21','T25','T28','T32']);
// T11 ran but could not establish a result; tests that never ran stay unrecorded rather than inconclusive.
const inconclusive={T11:['A resumption ticket was issued, but the test client did not attempt resumption. The cause is not yet established.','No resumed handshake was captured, so no comparison was possible.']};
const required=new Set(['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10','T12','T13','T14','T15','T16','T17','T18','T20','T24','T26','T27','T29','T30','T31','T33','XT-001']);
const proofFor={T01:'EV-102',T02:'EV-103',T03:'EV-103',T04:'EV-102',T05:'EV-104',T07:'EV-107',T09:'EV-109',T12:'EV-104',T14:'EV-110',T15:'EV-103',T16:'EV-116',T17:'EV-102',T18:'EV-116',T23:'EV-110',T26:'EV-111',T30:'EV-104',T33:'EV-109'};
const observedDetail={
  T01:['CU-001 full TLS 1.3 handshake selected X25519MLKEM768 on the strict admin listener.','EV-103 records rejection of a classical-only peer on the strict listener.'],
  T02:['Strict admin listener rejected a classical-only peer; compatibility listener accepted X25519 under separate policy.','The classical-only peer is the deliberate downgrade control.'],
  T03:['Strict listener rejected an unsupported hybrid group without silently switching to classical.','Unsupported group sent as the deliberate failure case.'],
  T04:['Admin certificate chain and hostname validated with ECDSA P-384 identity.','Wrong-name lab certificate rejected; key exchange alone was not treated as identity proof.'],
  T05:['Gateway to internal policy service selected hybrid group and presented the expected service certificate.','Unexpected service identity rejected in the synthetic trace.'],
  T07:['Trusted ECDSA P-384 firmware image accepted by the bench updater.','Byte-changed image rejected; recovery image remains a separate blocked test.'],
  T09:['Twelve-gateway bench recorded 41 ms median and 68 ms 95th-percentile full handshakes.','A size-constrained proxy path was checked in T33; field radio failure behavior remains unknown.'],
  T12:['Wrong-name and expired internal service certificates rejected.','Revoked client certificate remains blocked under T06.'],
  T14:['Lab CA issue, renewal, expiry, and revocation events were reviewed without exposing key values.','Expired and revoked lab certificates rejected.'],
  T15:['The strict admin listener was configured to require the hybrid group.','Classical-only client rejected; compatibility listener remains separately governed.'],
  T16:['CBOM listing, lab configuration, and trace IDs were compared for the mapped paths.','A listed but unobserved recovery use stayed a gap instead of being marked deployed.'],
  T17:['The buyer lab replayed the supplier admin hybrid claim on 4.2.0-demo with the stated entitlement.','A prior-release trace EV-118 was rejected as wrong-scope proof.'],
  T18:['ML-KEM-768 appearing in the CBOM was not counted as runtime proof for the broker, VPN, or recovery path.','CU-008 and CU-010 remain claimed/listed despite the provided component inventory.'],
  T23:['Staging CA issued, renewed, and revoked a representative device certificate.','Expired and revoked certificates rejected.'],
  T26:['The supplier compared fictional 4.1-demo and 4.2.0-demo crypto inventories and identified the admin hybrid addition.','Missing recovery ROM coverage was retained as a gap. The comparison is supplier-produced, so the buyer still needs its own.'],
  T30:['Internal gateway-to-policy-service mTLS recorded hybrid key exchange and classical identities at both ends.','Wrong service identity rejected; client revocation remains T06.'],
  T33:['The lab measured a 3.4 KB handshake flight through a 1500-byte-MTU proxy path.','Fragmented records succeeded in the bench proxy; radio and fleet paths remain open.']
};
const acceptance={T06:'Valid client certificate must authenticate; unauthorized, expired, and revoked clients must fail.',T08:'An independent implementation must negotiate the same approved group and validate identity; record peer versions.',T10:'Policy change and rollback must restore service without silent downgrade or unsafe firmware state.',T13:'Every mapped use must point to a release-matching BOM reference; missing links remain explicit gaps.',T20:'Record both IKEv2 transforms and identities on every buyer tunnel; reject an unauthorized peer.',T24:'Trusted boot and recovery images must load; changed or untrusted images must fail safely.',T27:'Malformed or failed encapsulation must not expose secret material or establish a connection.',T29:'Mixed peers must follow the approved fallback or rejection policy with service recovery measured.',T31:'Representative constrained device must accept trusted update, reject changed update, and recover safely.','XT-001':'Low-bandwidth reconnect must recover within the buyer-approved outage budget without silent downgrade.'};
const testState={};
const allTests=[...tests,['XT-001','Low-bandwidth field maintenance reconnect','Show negotiation and recovery through the radio maintenance path','Field radio and gateway','CISA-3; buyer test plan']];
for(const [id,title,expected,path] of allTests){
  const isObserved=observed.has(id),isBlocked=blocked.has(id),isNA=notApplicable.has(id);
  const use=testUse[id];
  testState[id]={productBuild:version,toolVersion:isObserved?'Synthetic buyer lab notebook 1.0':'Planned method; tool/version to record',cryptoUseId:use,
    controlIds:({T01:'C05,C25',T06:'C06,C23',T08:'C12,C24',T10:'C13,C23',T13:'C03,C09,C19,C20',T20:'C16,C25',T24:'C08,C26',T27:'C04,C23',T29:'C23,C25',T31:'C23,C26','XT-001':'C25,C26'})[id]||'',
    result:isObserved?'Observed':inconclusive[id]?'Inconclusive':isNA?'N/A':'',
    observed:isObserved?`SYNTHETIC LAB OBSERVATION: ${observedDetail[id][0]} Supporting record: ${proofFor[id]}.`:inconclusive[id]?`SYNTHETIC LAB OBSERVATION: ${inconclusive[id][0]}`:isBlocked?'No completed result. Scheduled test is blocked by the dependency named below.':isNA?'No such path or claim in the defined buyer setup. Reassess if scope changes.':'Not run. Planning record only.',
    negative:isObserved?observedDetail[id][1]:inconclusive[id]?inconclusive[id][1]:isNA?'Not applicable to this setup.':'Pending: record a deliberate failure case and expected rejection.',
    limits:isObserved?'Synthetic bench only; no production fleet, radio, or unlisted software version was tested.':isNA?'Applicability decision is specific to the fictional 4.2.0-demo deployment.':'No execution; supplier access or operational safety approval is still needed.',
    reviewerDate:isObserved||inconclusive[id]?`Fictional buyer lab, ${date}`:'',requiredForProcurement:required.has(id)?'Yes':isNA?'No':'Undecided',
    procurementBasis:required.has(id)?'Illustrative buyer acceptance gate PQC-OT-01 rev A; procurement owner to confirm before any real solicitation.':isNA?'No deployed path or validation claim in this defined scope.':'Buyer to decide after topology and supplier roadmap review.',
    blocked:isBlocked?'Yes':'No',blockerDetail:isBlocked?({T06:'Client-certificate revocation fixture unavailable; PKI team.',T08:'Second independent TLS stack not yet supplied; vendor and lab.',T10:'Safe rollback image and change window absent; OT operations.',T13:'Supplier CBOM provenance and recovery ROM component mapping incomplete.',T20:'Field router access and IKEv2 trace authorization pending.',T24:'Recovery ROM test bench lacks safe sacrificial device.',T27:'KEM failure-injection harness unavailable.',T29:'Mixed-version fleet maintenance window not approved.',T31:'Constrained controller safety plan not approved.','XT-001':'Field radio simulator and maintenance window pending.'})[id]:'',
    blockerDecision:isBlocked?'Reschedule':'',dependencies:isBlocked?'Yes':'No',
    dependencyDetail:isBlocked?`Prerequisite: resolve blocker for ${id}; link AC-${({T06:'002',T08:'005',T10:'006',T13:'003',T20:'003',T24:'004',T27:'005',T29:'006',T31:'004','XT-001':'006'})[id]}.`:'None beyond approved lab scope and supplied build.',
    ownerTeam:['T07','T24','T31'].includes(id)?'Firmware and OT safety (fictional)':id==='T20'||id==='XT-001'?'Network and OT operations (fictional)':id==='T13'||id==='T16'||id==='T18'||id==='T26'?'Supply-chain security (fictional)':'Buyer security test team (fictional)',
    partnerTeams:'Vendor engineering; procurement; OT operations as needed',approvalOwner:'Buyer procurement and OT safety leads (fictional)',
    plannedDate:isBlocked?'2026-11-20':'',environment:isObserved?'Isolated 12-device bench':'Proposed authorized staging lab',
    testMethod:`For ${id}, ${expected.toLowerCase()}. Capture build, settings, peer version, and both success and failure evidence.`,
    acceptanceRule:isNA?'Buyer confirms the path or claim is absent from the purchased setup.':acceptance[id]||`Expected outcome: ${expected}. Review actual trace and negative control before marking complete.`};
}

const actions=[
 ['AC-001','Q02, Q13, CU-002, T20, C05','Classical broker and VPN paths remain exposed over the data life.','Give path-specific PQC migration and entitlement milestones.','Vendor platform lead (fictional)','Open','2026-11-30','Contractable 4.3 plan','', 'Do not treat the admin TLS success as covering broker or VPN paths.'],
 ['AC-002','Q17, C06, T06, CU-003','Client-certificate revocation negative test is blocked.','Build a revocation fixture and rerun mutual-authentication failure case.','Buyer PKI lead (fictional)','Blocked','2026-11-20','PKI staging CA access','', 'Owner must sign off on the failure mode.'],
 ['AC-003','Q08, Q35, C03, C19, T13, T16, CU-010','BOM and inventory omit recovery and field variants.','Reconcile signed release BOMs, live traces, and fleet configuration.','Supply-chain and OT inventory leads (fictional)','In progress','2026-12-01','Supplier full BOM delivery','', 'Record missing assets and exact composition.'],
 ['AC-004','Q19, Q20, C08, C26, T24, T31, CU-010','Recovery and constrained-device update safety unproved.','Test trusted and tampered recovery under an approved safety procedure.','Firmware and OT safety leads (fictional)','Blocked','2026-12-15','Sacrificial device and outage approval','', 'A classical signature integrity result is not PQC signing.'],
 ['AC-005','Q23, C12, C24, T08, T27, CU-001','Independent interoperability and KEM failure handling missing.','Run a second implementation and malformed-input replay.','Buyer test lead (fictional)','Open','2026-12-10','Second peer and test harness','', 'No conformance certificate is claimed.'],
 ['AC-006','Q24, Q25, C13, C25, T10, T29, T33, XT-001, CU-001','Fleet performance and mixed-version rollback unknown.','Test packet limits, field radio reconnect, staged rollout, and rollback.','OT operations and network leads (fictional)','Open','2027-01-10','Maintenance window and radio simulator','', 'This is a purchase gate for the 120-device plan.'],
 ['AC-007','Q06, Q33, Q34, Q36, C02, C24','Assurance and upstream provenance incomplete.','Get signed product-scoped response, supplier coverage, and BOM provenance.','Procurement and supply-chain leads (fictional)','Open','2026-12-05','Vendor authorized signatory','', 'No PQCMM level or FIPS validation claim may be inferred.'],
 ['AC-008','Q27, Q38, C15, C22','Fleet feature rights and upgrade cost unresolved.','Put PQC entitlement, support, and redistribution terms in the signed order.','Procurement and legal leads (fictional)','Open','2026-12-20','Commercial proposal and counsel review','', 'Sample support sheet is not a binding order.'],
 ['AC-009','T02, C07','Strict-listener fallback policy needed buyer approval.','Document why compatibility listener remains enabled in the lab.','Buyer network lead (fictional)','Closed','2026-10-09','Lab-only exception','EV-103','Closure proof is a scoped synthetic negative-control trace.'],
 ['AC-010','T26, C14','Change trigger needed for library updates.','Record release-diff and reassessment trigger.','Buyer security lead (fictional)','Closed','2026-10-09','Sample change-control review','EV-111','Closure applies only to the fictional sample process.'],
 ['AC-011','Q15, T02, CU-001','The lab compatibility listener still accepts classical-only clients.','Keep the compatibility listener off the fleet image; review before any production rollout.','Buyer OT safety lead (fictional)','Accepted risk','2027-02-01','Fleet image review','','Risk accepted for the isolated bench only.','Buyer OT safety lead (fictional)','Isolated 12-device bench compatibility listener only','2027-02-01']
].map(([id,linked,gap,task,owner,status,targetDate,milestone,closureProof,note,riskApprover='',riskScope='',riskExpiry=''])=>({id,linked,gap,task,owner,status,targetDate,milestone,closureProof,note,riskApprover,riskScope,riskExpiry}));

const licensing={licenseModel:'Fictional appliance subscription plus device support',
  pqcEntitlement:'Admin hybrid TLS included in demo; broker PQC, fleet migration, and recovery upgrade rights unresolved.',
  supportTerm:'Sample support through 2029-12-31; binding order pending.',
  migrationRights:'Lab testing allowed in fictional evaluation terms. Production rollout and firmware migration rights require final contract.',
  thirdPartyTerms:'Sample SBOM lists illustrative components; verify actual upstream notices and CycloneDX attribution before publication.',
  proofId:'EV-108',reviewNote:'SYNTHETIC. AC-008 remains open. No binding license is accepted by this example.'};
const licenses=[
  {id:'LI-001',name:'HarborLink evaluation agreement (fictional)',appliesTo:product,licenseId:'HL-EVAL-2026-DEMO',sourceUrl:'',rights:'12-device lab evaluation and sample trace review.',conditions:'No production fleet rollout; no reliance as an actual supplier agreement.',proofId:'EV-117',reviewNote:'SYNTHETIC. Binding order pending AC-008.'},
  {id:'LI-002',name:'HarborLink component notice (fictional)',appliesTo:'Fictional gateway libraries in BM-001',licenseId:'SAMPLE-NOTICE-1',sourceUrl:'',rights:'Internal review of sample SBOM and CBOM.',conditions:'Confirm real component licenses and redistribution terms.',proofId:'EV-117',reviewNote:'Training placeholder, not a third-party license conclusion.'},
  {id:'LI-003',name:'CycloneDX JSON schema license notice',appliesTo:'BOM format and local schema used by this training packet',licenseId:'Apache-2.0',sourceUrl:'https://github.com/CycloneDX/specification/blob/master/LICENSE',rights:'Review and use of the schema under its license.',conditions:'Keep required notices with any redistributed schema material.',proofId:'EV-117',reviewNote:'Verify current upstream terms before publishing derived material.'}
];

const assessment=normalizeAssessment({schemaVersion:3,createdAt:`${date}T12:00:00Z`,updatedAt:`${date}T12:00:00Z`,
  buyer,survey:surveyState,crypto,boms,evidence,tests:testState,
  customTests:[{id:'XT-001',title:'Low-bandwidth field maintenance reconnect',expected:'Show group negotiation, packet-size behavior, and recovery through the radio uplink',path:'Field radio and gateway',sources:'CISA-3; buyer test plan'}],
  controls:controlState,actions,licensing,licenses});
const payload={format:'pqc-buyer-workbook',exportedAt:`${date}T12:00:00Z`,assessment,attachments};
const file=`${out}PQC_FICTIONAL_HarborLink_Complete_Example_Import.json`;
await writeFile(file,JSON.stringify(payload,null,2));
const claimFile=`${out}PQC_FICTIONAL_HarborLink_CycloneDX_Claim_Drafts.json`;
await writeFile(claimFile,JSON.stringify(buildCycloneDxDraft(assessment,'urn:uuid:3e24d397-690b-48dc-9b84-a5580dab9b1b'),null,2));
const score=buildScorecard(assessment,survey,controls,allTests);
console.log(JSON.stringify({file,claimFile,questions:score.answered,crypto:score.totalUses,boms:score.totalBoms,evidence:score.totalProof,
  attachments:attachments.length,tests:score.totalTests,controls:score.totalControls,actions:actions.length,licenses:licenses.length,
  required:score.requiredTests,blockedRequired:score.blockedRequiredTests,unresolvedRequired:score.unresolvedRequiredTests,qualifiedProof:score.qualifiedProof,
  qualifiedByProducer:score.qualifiedByProducer,supportedTests:score.supportedTests,observedTests:score.observedTests,inconclusiveTests:score.inconclusiveTests,
  supportedAnswers:score.supportedAnswers,yesAnswers:score.yesAnswers,acceptedControls:score.acceptedControls,supportedControls:score.supportedControls,
  applicableControls:score.applicableControls,openActions:score.openActions,acceptedRisks:score.acceptedRisks,counterProof:score.counterProof,decision:buyer.decision},null,2));
