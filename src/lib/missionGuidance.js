// Topic IDs are shared by mission requirements and the Help topic index.
export const gameplayGuides = {
  land: {
    title: 'Choose your foothold',
    pages: [
      '[DRAFT] Lea here. Compare available lots, lease costs, nearby resources, and the commute from your crew. Choose a location that suits your operation. [DRAFT]',
      '[DRAFT] On your chosen lot, open Plan Building and select a Warehouse. Review the site before confirming. Planning creates a construction site; it does not complete the building. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'actionButtonPlan']
  },
  sample: {
    title: 'Prospect the surface',
    pages: [
      '[DRAFT] Core drills reveal deposits beneath the surface. Choose a resource and sampling site, then arrange access to a core drill in a suitable inventory. [DRAFT]',
      '[DRAFT] Open Core Sample at your chosen site and review the drill source and resource. When sampling finishes, return to finish the action and inspect the deposit. [DRAFT]'
    ],
    highlights: ['hudMenuResources', 'actionButtonCoreSample']
  },
  construct: {
    title: 'Construct a building',
    pages: [
      '[DRAFT] Choose a suitable lot and plan the building you need. Review its construction materials and decide which to produce, buy, or move from your inventories. [DRAFT]',
      '[DRAFT] Select your construction site and open Construct. Choose your material sources and review the costs. After the timer, finish construction to make the building operational. [DRAFT]'
    ],
    highlights: ['actionButtonPlan', 'actionButtonConstruct']
  },
  extract: {
    title: 'Extract resources',
    pages: [
      '[DRAFT] Compare your deposits and choose what to extract. Check that you have access to an operational Extractor and enough capacity at your chosen destination. [DRAFT]',
      '[DRAFT] Open Extract, choose the deposit, amount, and destination, then review the operation. When the timer ends, finish extraction to receive the output. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'actionButtonExtract']
  },
  storage: {
    title: 'Receive goods into storage',
    pages: [
      '[DRAFT] Complete your Warehouse and review its available capacity. Choose the goods you want to store and arrange their movement from another inventory. [DRAFT]',
      '[DRAFT] Review the delivery destination and quantities. Finish the incoming delivery when it is ready; goods still in transit have not arrived in storage. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'hudMenuMyAssets']
  },
  refine: {
    title: 'Refine resources',
    pages: [
      '[DRAFT] Choose a Refinery process by comparing its inputs, outputs, and your next needs. Arrange the inputs and output capacity before starting. [DRAFT]',
      '[DRAFT] Open Process at your Refinery. Choose a recipe, batch size, and inventories. Review the operation, then return after its timer to finish processing. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'actionButtonProcess']
  },
  cultivate: {
    title: 'Cultivate life',
    pages: [
      '[DRAFT] A Bioreactor turns suitable inputs into biological products. Compare available processes and choose an output that supports your operation. [DRAFT]',
      '[DRAFT] At your Bioreactor, choose the process, batch size, and input and output inventories. Supply the inputs, start the operation, and finish it when ready. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'actionButtonProcess']
  },
  manufacture: {
    title: 'Manufacture goods',
    pages: [
      '[DRAFT] A Factory converts materials into manufactured products. Choose a process and work out how you will supply its inputs and store its output. [DRAFT]',
      '[DRAFT] Open Process at your Factory and review the recipe, batch size, and inventories. Start when prepared and finish the operation after its timer. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'actionButtonProcess']
  },
  route: {
    title: 'Connect production stages',
    pages: [
      '[DRAFT] Compare production routes and choose one to pursue. Work out which buildings and inputs each stage needs before committing resources. [DRAFT]',
      '[DRAFT] Finish the first stage, then use its output in the second. Keep track of the intermediate inventory so the next process uses the goods you produced. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'actionButtonProcess']
  },
  use: {
    title: 'Put your output to work',
    pages: [
      '[DRAFT] Decide how your finished goods will support your crew or another operation. Review the inventory, quantity, and destination before using or delivering them. [DRAFT]',
      '[DRAFT] Finish any delivery and review the result. For food resupply, choose actual food from an inventory. [DRAFT]'
    ],
    highlights: ['hudMenuMyAssets', 'hudMenuMyAssets']
  }
};

const missionTopics = {
  MAKE_LANDFALL: ['land'],
  PROSPECT_THE_SURFACE: ['sample'],
  BEGIN_EXTRACTION: ['construct', 'extract'],
  ESTABLISH_STORAGE: ['construct', 'storage'],
  REFINE_THE_YIELD: ['construct', 'refine'],
  CULTIVATE_LIFE: ['construct', 'cultivate'],
  MANUFACTURE_GOODS: ['construct', 'manufacture'],
  CLOSE_THE_PRODUCTION_LOOP: ['route', 'route', 'use']
};

export const getMissionGuide = (mission, objectiveIndex = 0) => {
  const topics = missionTopics[mission.key];
  return topics?.[Math.min(objectiveIndex, topics.length - 1)];
};

export const campaignGuidance = '[DRAFT] Accept the mission before starting campaign work. Enable campaign participation in the action dialog and use qualifying campaign assets. The requirement below describes the work that earns credit. [DRAFT]';
export const waitingGuidance = '[DRAFT] Your crew has work underway. Return to Objectives when the action is ready to finish. You can close this guide whenever you are ready. [DRAFT]';
