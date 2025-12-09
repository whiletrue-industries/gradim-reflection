## Possible architecture for Gradin Reflections
GraDiM Reflections will work as an indipendent platform for interactive apps reflecting on the GraDiM archive.
It will be querying the GraDiM API for items and metadata.
It will be reachable from GraDiM interface through multiple paths, starting with the share interface.

## Structure
- Share:
  - App #1
  - App #2
  - App #3
  - App #4
  - App #5
 
## Parent / Child Communication
We may communicate between the iFrame and its parent using a standardized communication protocol
- DATA URL:
  - image blob
  - image url
- Text:
  - Title
  - Description
  - Link
- Metadata:
  - items used
  - tags
  - user-ID
  - username
  - email
  - etc..

Optional communication protocols:
-  URL
-  Post message

## Design System
- shared assets (css, fonts, colors) & components
  - app specific styles
  - app specific assets
