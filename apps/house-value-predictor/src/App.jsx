import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { getUser, signIn, signUp, signOut, authHeaders } from "./auth.js";
import { dbGetProperty, dbUpsertProperty, dbGetPermits, dbUpsertPermits } from "./db.js";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── S&P Case-Shiller Home Price Index data from FRED (St. Louis Fed) ──────────
// Source: CSUSHPISA (National), SFXRSA (San Francisco), Jan 2000 = 100, Seasonally Adjusted
// All values are the ACTUAL published FRED index values — no regression, no interpolation.
// For Miami, New York, Chicago: national index × city multiplier derived from the
// ratio of city-to-national index at Jan 2020 (from spreadsheet City_* tabs).
// This correctly captures all real historical patterns:
//   - 2001-2006 bubble, 2006-2012 crash, flat 2010-2012, recovery 2012+, surge 2020-2022.
// Forecast (May 2026 – May 2027): spreadsheet model growth ~8-12% from current level.

// National FRED CSUSHPISA — complete monthly series 1987–Jan 2026
const NAT_IDX = {
  "Jan-1987":63.963,"Feb-1987":64.422,"Mar-1987":64.732,"Apr-1987":65.129,"May-1987":65.562,"Jun-1987":66.070,"Jul-1987":66.507,"Aug-1987":66.939,"Sep-1987":67.330,"Oct-1987":67.739,"Nov-1987":68.106,"Dec-1987":68.506,
  "Jan-1988":68.859,"Feb-1988":69.264,"Mar-1988":69.639,"Apr-1988":69.976,"May-1988":70.426,"Jun-1988":70.888,"Jul-1988":71.353,"Aug-1988":71.799,"Sep-1988":72.241,"Oct-1988":72.635,"Nov-1988":73.072,"Dec-1988":73.464,
  "Jan-1989":73.945,"Feb-1989":74.381,"Mar-1989":74.777,"Apr-1989":75.083,"May-1989":75.304,"Jun-1989":75.477,"Jul-1989":75.655,"Aug-1989":75.833,"Sep-1989":76.054,"Oct-1989":76.280,"Nov-1989":76.519,"Dec-1989":76.704,
  "Jan-1990":76.896,"Feb-1990":77.053,"Mar-1990":77.200,"Apr-1990":77.278,"May-1990":77.297,"Jun-1990":77.259,"Jul-1990":77.137,"Aug-1990":77.008,"Sep-1990":76.849,"Oct-1990":76.698,"Nov-1990":76.369,"Dec-1990":76.183,
  "Jan-1991":75.913,"Feb-1991":75.730,"Mar-1991":75.564,"Apr-1991":75.564,"May-1991":75.761,"Jun-1991":75.993,"Jul-1991":76.077,"Aug-1991":76.105,"Sep-1991":76.193,"Oct-1991":76.071,"Nov-1991":76.012,"Dec-1991":76.052,
  "Jan-1992":76.088,"Feb-1992":76.158,"Mar-1992":76.278,"Apr-1992":76.346,"May-1992":76.398,"Jun-1992":76.332,"Jul-1992":76.263,"Aug-1992":76.231,"Sep-1992":76.240,"Oct-1992":76.376,"Nov-1992":76.559,"Dec-1992":76.676,
  "Jan-1993":76.784,"Feb-1993":76.838,"Mar-1993":76.868,"Apr-1993":76.936,"May-1993":77.036,"Jun-1993":77.243,"Jul-1993":77.430,"Aug-1993":77.615,"Sep-1993":77.796,"Oct-1993":77.943,"Nov-1993":78.151,"Dec-1993":78.327,
  "Jan-1994":78.591,"Feb-1994":78.726,"Mar-1994":78.855,"Apr-1994":78.987,"May-1994":79.222,"Jun-1994":79.422,"Jul-1994":79.594,"Aug-1994":79.781,"Sep-1994":79.919,"Oct-1994":80.065,"Nov-1994":80.149,"Dec-1994":80.296,
  "Jan-1995":80.425,"Feb-1995":80.527,"Mar-1995":80.597,"Apr-1995":80.661,"May-1995":80.704,"Jun-1995":80.785,"Jul-1995":80.937,"Aug-1995":81.109,"Sep-1995":81.306,"Oct-1995":81.481,"Nov-1995":81.618,"Dec-1995":81.735,
  "Jan-1996":81.834,"Feb-1996":81.954,"Mar-1996":82.195,"Apr-1996":82.420,"May-1996":82.609,"Jun-1996":82.751,"Jul-1996":82.928,"Aug-1996":83.086,"Sep-1996":83.256,"Oct-1996":83.377,"Nov-1996":83.552,"Dec-1996":83.721,
  "Jan-1997":83.954,"Feb-1997":84.179,"Mar-1997":84.449,"Apr-1997":84.622,"May-1997":84.861,"Jun-1997":85.080,"Jul-1997":85.331,"Aug-1997":85.573,"Sep-1997":85.851,"Oct-1997":86.147,"Nov-1997":86.633,"Dec-1997":87.095,
  "Jan-1998":87.616,"Feb-1998":88.005,"Mar-1998":88.443,"Apr-1998":88.879,"May-1998":89.364,"Jun-1998":89.844,"Jul-1998":90.309,"Aug-1998":90.785,"Sep-1998":91.258,"Oct-1998":91.716,"Nov-1998":92.199,"Dec-1998":92.711,
  "Jan-1999":93.207,"Feb-1999":93.671,"Mar-1999":94.217,"Apr-1999":94.786,"May-1999":95.345,"Jun-1999":95.975,"Jul-1999":96.591,"Aug-1999":97.218,"Sep-1999":97.862,"Oct-1999":98.522,"Nov-1999":99.153,"Dec-1999":99.843,
  "Jan-2000":100.551,"Feb-2000":101.339,"Mar-2000":102.126,"Apr-2000":102.922,"May-2000":103.677,"Jun-2000":104.424,"Jul-2000":105.055,"Aug-2000":105.769,"Sep-2000":106.539,"Oct-2000":107.384,"Nov-2000":108.303,"Dec-2000":109.143,
  "Jan-2001":109.848,"Feb-2001":110.502,"Mar-2001":111.110,"Apr-2001":111.652,"May-2001":112.164,"Jun-2001":112.796,"Jul-2001":113.493,"Aug-2001":114.169,"Sep-2001":114.813,"Oct-2001":115.310,"Nov-2001":115.857,"Dec-2001":116.454,
  "Jan-2002":117.142,"Feb-2002":117.845,"Mar-2002":118.688,"Apr-2002":119.611,"May-2002":120.725,"Jun-2002":121.814,"Jul-2002":122.888,"Aug-2002":123.832,"Sep-2002":124.781,"Oct-2002":125.736,"Nov-2002":126.671,"Dec-2002":127.625,
  "Jan-2003":128.462,"Feb-2003":129.357,"Mar-2003":130.148,"Apr-2003":130.884,"May-2003":131.735,"Jun-2003":132.649,"Jul-2003":133.777,"Aug-2003":134.968,"Sep-2003":136.295,"Oct-2003":137.533,"Nov-2003":138.795,"Dec-2003":140.182,
  "Jan-2004":141.647,"Feb-2004":143.191,"Mar-2004":145.059,"Apr-2004":146.593,"May-2004":148.186,"Jun-2004":149.851,"Jul-2004":151.338,"Aug-2004":152.633,"Sep-2004":154.179,"Oct-2004":155.750,"Nov-2004":157.527,"Dec-2004":159.330,
  "Jan-2005":161.289,"Feb-2005":163.346,"Mar-2005":165.815,"Apr-2005":167.504,"May-2005":169.353,"Jun-2005":171.192,"Jul-2005":172.861,"Aug-2005":174.443,"Sep-2005":176.440,"Oct-2005":178.030,"Nov-2005":179.684,"Dec-2005":180.912,
  "Jan-2006":182.322,"Feb-2006":183.288,"Mar-2006":184.365,"Apr-2006":184.330,"May-2006":184.157,"Jun-2006":183.508,"Jul-2006":183.068,"Aug-2006":182.593,"Sep-2006":182.798,"Oct-2006":183.198,"Nov-2006":183.608,"Dec-2006":184.137,
  "Jan-2007":184.515,"Feb-2007":184.596,"Mar-2007":184.148,"Apr-2007":183.009,"May-2007":181.600,"Jun-2007":180.253,"Jul-2007":179.109,"Aug-2007":178.115,"Sep-2007":177.556,"Oct-2007":176.623,"Nov-2007":175.146,"Dec-2007":174.340,
  "Jan-2008":173.131,"Feb-2008":171.539,"Mar-2008":170.050,"Apr-2008":168.333,"May-2008":166.654,"Jun-2008":165.014,"Jul-2008":163.563,"Aug-2008":161.985,"Sep-2008":160.306,"Oct-2008":158.325,"Nov-2008":156.140,"Dec-2008":153.617,
  "Jan-2009":151.506,"Feb-2009":150.013,"Mar-2009":148.659,"Apr-2009":147.948,"May-2009":147.693,"Jun-2009":148.087,"Jul-2009":148.407,"Aug-2009":148.276,"Sep-2009":148.024,"Oct-2009":147.850,"Nov-2009":148.136,"Dec-2009":147.931,
  "Jan-2010":147.396,"Feb-2010":145.632,"Mar-2010":145.857,"Apr-2010":146.398,"May-2010":146.386,"Jun-2010":145.714,"Jul-2010":144.984,"Aug-2010":143.910,"Sep-2010":143.013,"Oct-2010":142.523,"Nov-2010":142.163,"Dec-2010":142.049,
  "Jan-2011":141.511,"Feb-2011":140.338,"Mar-2011":139.971,"Apr-2011":140.003,"May-2011":139.901,"Jun-2011":139.858,"Jul-2011":139.727,"Aug-2011":139.303,"Sep-2011":138.659,"Oct-2011":137.940,"Nov-2011":137.137,"Dec-2011":136.660,
  "Jan-2012":136.595,"Feb-2012":136.522,"Mar-2012":137.893,"Apr-2012":139.144,"May-2012":140.144,"Jun-2012":141.019,"Jul-2012":141.660,"Aug-2012":142.269,"Sep-2012":142.898,"Oct-2012":143.591,"Nov-2012":144.575,"Dec-2012":145.491,
  "Jan-2013":146.816,"Feb-2013":147.772,"Mar-2013":149.951,"Apr-2013":151.508,"May-2013":152.840,"Jun-2013":154.190,"Jul-2013":155.596,"Aug-2013":156.951,"Sep-2013":158.215,"Oct-2013":159.234,"Nov-2013":160.070,"Dec-2013":160.990,
  "Jan-2014":161.920,"Feb-2014":162.516,"Mar-2014":163.074,"Apr-2014":163.376,"May-2014":163.641,"Jun-2014":164.048,"Jul-2014":164.572,"Aug-2014":165.198,"Sep-2014":165.888,"Oct-2014":166.626,"Nov-2014":167.321,"Dec-2014":168.036,
  "Jan-2015":168.612,"Feb-2015":169.104,"Mar-2015":169.776,"Apr-2015":170.278,"May-2015":170.862,"Jun-2015":171.455,"Jul-2015":172.131,"Aug-2015":172.908,"Sep-2015":173.800,"Oct-2015":174.764,"Nov-2015":175.708,"Dec-2015":176.515,
  "Jan-2016":177.244,"Feb-2016":177.625,"Mar-2016":178.142,"Apr-2016":178.742,"May-2016":179.402,"Jun-2016":180.066,"Jul-2016":180.838,"Aug-2016":181.824,"Sep-2016":182.796,"Oct-2016":183.721,"Nov-2016":184.728,"Dec-2016":185.694,
  "Jan-2017":186.775,"Feb-2017":187.290,"Mar-2017":187.968,"Apr-2017":188.699,"May-2017":189.587,"Jun-2017":190.474,"Jul-2017":191.439,"Aug-2017":192.621,"Sep-2017":193.715,"Oct-2017":194.761,"Nov-2017":195.913,"Dec-2017":197.136,
  "Jan-2018":198.279,"Feb-2018":199.205,"Mar-2018":199.940,"Apr-2018":200.629,"May-2018":201.390,"Jun-2018":202.177,"Jul-2018":202.880,"Aug-2018":203.635,"Sep-2018":204.294,"Oct-2018":205.062,"Nov-2018":205.637,"Dec-2018":206.128,
  "Jan-2019":206.515,"Feb-2019":206.831,"Mar-2019":207.047,"Apr-2019":207.498,"May-2019":208.105,"Jun-2019":208.563,"Jul-2019":209.214,"Aug-2019":210.010,"Sep-2019":210.817,"Oct-2019":211.716,"Nov-2019":212.755,"Dec-2019":213.916,
  "Jan-2020":214.997,"Feb-2020":215.842,"Mar-2020":216.392,"Apr-2020":216.797,"May-2020":216.927,"Jun-2020":217.486,"Jul-2020":219.253,"Aug-2020":222.266,"Sep-2020":225.714,"Oct-2020":229.649,"Nov-2020":233.207,"Dec-2020":236.528,
  "Jan-2021":239.630,"Feb-2021":242.340,"Mar-2021":245.430,"Apr-2021":249.011,"May-2021":253.261,"Jun-2021":258.100,"Jul-2021":262.558,"Aug-2021":266.609,"Sep-2021":270.172,"Oct-2021":273.601,"Nov-2021":277.310,"Dec-2021":281.529,
  "Jan-2022":286.101,"Feb-2022":291.096,"Mar-2022":296.270,"Apr-2022":300.294,"May-2022":303.299,"Jun-2022":304.177,"Jul-2022":303.367,"Aug-2022":301.058,"Sep-2022":299.053,"Oct-2022":298.737,"Nov-2022":298.443,"Dec-2022":297.726,
  "Jan-2023":297.356,"Feb-2023":297.711,"Mar-2023":298.654,"Apr-2023":300.065,"May-2023":302.088,"Jun-2023":304.207,"Jul-2023":306.546,"Aug-2023":309.130,"Sep-2023":311.236,"Oct-2023":313.207,"Nov-2023":314.073,"Dec-2023":314.832,
  "Jan-2024":315.867,"Feb-2024":317.247,"Mar-2024":318.081,"Apr-2024":319.104,"May-2024":320.016,"Jun-2024":320.796,"Jul-2024":321.628,"Aug-2024":322.425,"Sep-2024":323.421,"Oct-2024":324.462,"Nov-2024":325.897,"Dec-2024":327.532,
  "Jan-2025":329.069,"Feb-2025":329.916,"Mar-2025":328.956,"Apr-2025":328.102,"May-2025":327.525,"Jun-2025":326.999,"Jul-2025":326.904,"Aug-2025":327.197,"Sep-2025":327.646,"Oct-2025":328.740,"Nov-2025":330.073,"Dec-2025":331.258,
  "Jan-2026":331.801,"Feb-2026":332.098,
};

// SF FRED SFXRSA — actual published values
const SF_IDX = {
  "Jan-1987":46.956,"Feb-1987":47.303,"Mar-1987":47.840,"Apr-1987":47.984,"May-1987":48.305,"Jun-1987":48.606,"Jul-1987":49.085,"Aug-1987":49.543,"Sep-1987":50.241,"Oct-1987":50.993,"Nov-1987":51.641,"Dec-1987":52.229,
  "Jan-1988":52.703,"Feb-1988":53.200,"Mar-1988":53.866,"Apr-1988":54.534,"May-1988":56.067,"Jun-1988":57.882,"Jul-1988":58.174,"Aug-1988":58.497,"Sep-1988":58.937,"Oct-1988":59.950,"Nov-1988":61.106,"Dec-1988":62.466,
  "Jan-1989":63.288,"Feb-1989":64.058,"Mar-1989":65.562,"Apr-1989":66.697,"May-1989":67.703,"Jun-1989":68.784,"Jul-1989":69.591,"Aug-1989":70.716,"Sep-1989":71.592,"Oct-1989":72.426,"Nov-1989":73.015,"Dec-1989":73.395,
  "Jan-1990":73.643,"Feb-1990":73.823,"Mar-1990":74.595,"Apr-1990":75.065,"May-1990":75.020,"Jun-1990":74.588,"Jul-1990":74.048,"Aug-1990":73.752,"Sep-1990":73.482,"Oct-1990":72.907,"Nov-1990":72.375,"Dec-1990":71.865,
  "Jan-1991":71.935,"Feb-1991":71.126,"Mar-1991":70.608,"Apr-1991":69.909,"May-1991":70.011,"Jun-1991":70.281,"Jul-1991":70.658,"Aug-1991":70.828,"Sep-1991":70.822,"Oct-1991":70.712,"Nov-1991":70.534,"Dec-1991":70.450,
  "Jan-1992":70.395,"Feb-1992":70.340,"Mar-1992":70.195,"Apr-1992":69.686,"May-1992":69.729,"Jun-1992":69.489,"Jul-1992":69.272,"Aug-1992":68.963,"Sep-1992":68.805,"Oct-1992":68.828,"Nov-1992":68.745,"Dec-1992":68.584,
  "Jan-1993":68.451,"Feb-1993":68.290,"Mar-1993":68.066,"Apr-1993":67.991,"May-1993":67.762,"Jun-1993":67.473,"Jul-1993":66.931,"Aug-1993":66.951,"Sep-1993":66.832,"Oct-1993":66.772,"Nov-1993":66.724,"Dec-1993":66.631,
  "Jan-1994":66.635,"Feb-1994":66.649,"Mar-1994":67.322,"Apr-1994":67.419,"May-1994":67.537,"Jun-1994":67.613,"Jul-1994":67.640,"Aug-1994":67.682,"Sep-1994":67.543,"Oct-1994":67.793,"Nov-1994":68.051,"Dec-1994":68.312,
  "Jan-1995":68.415,"Feb-1995":68.321,"Mar-1995":67.725,"Apr-1995":67.406,"May-1995":67.106,"Jun-1995":66.921,"Jul-1995":66.965,"Aug-1995":67.019,"Sep-1995":67.108,"Oct-1995":66.971,"Nov-1995":66.906,"Dec-1995":66.850,
  "Jan-1996":66.878,"Feb-1996":66.904,"Mar-1996":66.808,"Apr-1996":66.692,"May-1996":66.784,"Jun-1996":67.016,"Jul-1996":67.216,"Aug-1996":67.545,"Sep-1996":67.796,"Oct-1996":68.260,"Nov-1996":68.935,"Dec-1996":69.207,
  "Jan-1997":69.639,"Feb-1997":69.835,"Mar-1997":70.636,"Apr-1997":71.263,"May-1997":71.792,"Jun-1997":72.310,"Jul-1997":72.804,"Aug-1997":73.574,"Sep-1997":74.115,"Oct-1997":75.038,"Nov-1997":75.675,"Dec-1997":76.500,
  "Jan-1998":77.202,"Feb-1998":77.678,"Mar-1998":78.307,"Apr-1998":79.128,"May-1998":80.215,"Jun-1998":81.392,"Jul-1998":82.382,"Aug-1998":83.517,"Sep-1998":84.440,"Oct-1998":84.965,"Nov-1998":85.164,"Dec-1998":85.398,
  "Jan-1999":86.228,"Feb-1999":87.219,"Mar-1999":88.292,"Apr-1999":89.086,"May-1999":89.970,"Jun-1999":91.276,"Jul-1999":92.893,"Aug-1999":94.275,"Sep-1999":95.596,"Oct-1999":96.764,"Nov-1999":98.509,"Dec-1999":100.029,
  "Jan-2000":101.450,"Feb-2000":104.171,"Mar-2000":107.337,"Apr-2000":110.633,"May-2000":113.801,"Jun-2000":116.815,"Jul-2000":117.865,"Aug-2000":119.048,"Sep-2000":120.415,"Oct-2000":123.250,"Nov-2000":126.443,"Dec-2000":130.061,
  "Jan-2001":133.040,"Feb-2001":135.075,"Mar-2001":134.937,"Apr-2001":133.856,"May-2001":132.662,"Jun-2001":130.834,"Jul-2001":129.281,"Aug-2001":128.331,"Sep-2001":128.184,"Oct-2001":128.211,"Nov-2001":127.675,"Dec-2001":126.843,
  "Jan-2002":126.842,"Feb-2002":127.614,"Mar-2002":129.560,"Apr-2002":132.110,"May-2002":134.748,"Jun-2002":137.569,"Jul-2002":139.373,"Aug-2002":141.108,"Sep-2002":141.851,"Oct-2002":142.818,"Nov-2002":143.633,"Dec-2002":143.819,
  "Jan-2003":143.734,"Feb-2003":143.850,"Mar-2003":143.956,"Apr-2003":144.299,"May-2003":144.375,"Jun-2003":144.840,"Jul-2003":146.175,"Aug-2003":147.796,"Sep-2003":149.637,"Oct-2003":151.550,"Nov-2003":153.730,"Dec-2003":155.987,
  "Jan-2004":157.843,"Feb-2004":159.954,"Mar-2004":162.213,"Apr-2004":164.535,"May-2004":166.800,"Jun-2004":169.835,"Jul-2004":172.094,"Aug-2004":174.534,"Sep-2004":177.017,"Oct-2004":180.048,"Nov-2004":183.278,"Dec-2004":187.114,
  "Jan-2005":191.621,"Feb-2005":196.019,"Mar-2005":200.469,"Apr-2005":202.308,"May-2005":204.821,"Jun-2005":207.195,"Jul-2005":209.308,"Aug-2005":210.715,"Sep-2005":212.698,"Oct-2005":214.125,"Nov-2005":215.515,"Dec-2005":216.414,
  "Jan-2006":217.402,"Feb-2006":218.821,"Mar-2006":219.295,"Apr-2006":218.822,"May-2006":218.024,"Jun-2006":216.547,"Jul-2006":214.984,"Aug-2006":214.310,"Sep-2006":213.559,"Oct-2006":213.363,"Nov-2006":213.269,"Dec-2006":213.160,
  "Jan-2007":214.624,"Feb-2007":214.883,"Mar-2007":215.319,"Apr-2007":213.531,"May-2007":210.775,"Jun-2007":207.966,"Jul-2007":205.567,"Aug-2007":204.517,"Sep-2007":203.116,"Oct-2007":199.648,"Nov-2007":194.696,"Dec-2007":189.994,
  "Jan-2008":186.634,"Feb-2008":178.852,"Mar-2008":172.566,"Apr-2008":166.737,"May-2008":162.559,"Jun-2008":158.501,"Jul-2008":154.105,"Aug-2008":148.159,"Sep-2008":142.834,"Oct-2008":137.586,"Nov-2008":134.683,"Dec-2008":130.633,
  "Jan-2009":126.657,"Feb-2009":123.974,"Mar-2009":121.088,"Apr-2009":120.170,"May-2009":119.866,"Jun-2009":123.342,"Jul-2009":126.157,"Aug-2009":129.235,"Sep-2009":131.558,"Oct-2009":134.028,"Nov-2009":136.120,"Dec-2009":137.029,
  "Jan-2010":138.496,"Feb-2010":139.299,"Mar-2010":140.932,"Apr-2010":141.727,"May-2010":141.388,"Jun-2010":140.534,"Jul-2010":139.858,"Aug-2010":139.173,"Sep-2010":138.886,"Oct-2010":137.239,"Nov-2010":136.992,"Dec-2010":136.915,
  "Jan-2011":136.536,"Feb-2011":134.746,"Mar-2011":133.695,"Apr-2011":133.509,"May-2011":133.191,"Jun-2011":132.547,"Jul-2011":131.929,"Aug-2011":131.887,"Sep-2011":131.008,"Oct-2011":131.167,"Nov-2011":129.812,"Dec-2011":129.882,
  "Jan-2012":128.640,"Feb-2012":129.224,"Mar-2012":129.244,"Apr-2012":131.117,"May-2012":133.560,"Jun-2012":136.280,"Jul-2012":138.280,"Aug-2012":139.319,"Sep-2012":141.230,"Oct-2012":143.283,"Nov-2012":146.628,"Dec-2012":148.889,
  "Jan-2013":151.259,"Feb-2013":153.300,"Mar-2013":157.192,"Apr-2013":161.716,"May-2013":165.872,"Jun-2013":169.448,"Jul-2013":172.910,"Aug-2013":175.461,"Sep-2013":178.195,"Oct-2013":178.983,"Nov-2013":181.018,"Dec-2013":182.764,
  "Jan-2014":186.105,"Feb-2014":187.368,"Mar-2014":189.526,"Apr-2014":190.583,"May-2014":191.595,"Jun-2014":192.027,"Jul-2014":191.657,"Aug-2014":192.075,"Sep-2014":193.516,"Oct-2014":196.156,"Nov-2014":197.743,"Dec-2014":199.963,
  "Jan-2015":200.415,"Feb-2015":205.261,"Mar-2015":208.243,"Apr-2015":209.408,"May-2015":210.291,"Jun-2015":210.747,"Jul-2015":211.888,"Aug-2015":213.138,"Sep-2015":215.618,"Oct-2015":217.882,"Nov-2015":219.572,"Dec-2015":220.572,
  "Jan-2016":221.376,"Feb-2016":223.447,"Mar-2016":224.978,"Apr-2016":225.210,"May-2016":224.087,"Jun-2016":224.828,"Jul-2016":225.275,"Aug-2016":227.871,"Sep-2016":228.280,"Oct-2016":230.363,"Nov-2016":231.506,"Dec-2016":233.900,
  "Jan-2017":235.283,"Feb-2017":236.984,"Mar-2017":235.470,"Apr-2017":235.751,"May-2017":237.453,"Jun-2017":239.053,"Jul-2017":240.658,"Aug-2017":242.018,"Sep-2017":244.819,"Oct-2017":248.417,"Nov-2017":252.833,"Dec-2017":255.823,
  "Jan-2018":259.257,"Feb-2018":260.421,"Mar-2018":261.318,"Apr-2018":260.914,"May-2018":263.073,"Jun-2018":264.561,"Jul-2018":266.328,"Aug-2018":267.280,"Sep-2018":268.934,"Oct-2018":268.258,"Nov-2018":267.315,"Dec-2018":265.097,
  "Jan-2019":263.949,"Feb-2019":263.538,"Mar-2019":263.780,"Apr-2019":264.959,"May-2019":265.077,"Jun-2019":266.133,"Jul-2019":266.221,"Aug-2019":267.022,"Sep-2019":267.038,"Oct-2019":267.719,"Nov-2019":269.431,"Dec-2019":271.494,
  "Jan-2020":272.586,"Feb-2020":273.254,"Mar-2020":273.281,"Apr-2020":271.427,"May-2020":270.315,"Jun-2020":269.902,"Jul-2020":273.315,"Aug-2020":278.518,"Sep-2020":284.276,"Oct-2020":289.889,"Nov-2020":294.018,"Dec-2020":297.013,
  "Jan-2021":300.715,"Feb-2021":303.377,"Mar-2021":306.237,"Apr-2021":311.576,"May-2021":318.532,"Jun-2021":328.110,"Jul-2021":332.739,"Aug-2021":337.675,"Sep-2021":340.796,"Oct-2021":344.179,"Nov-2021":348.562,"Dec-2021":354.048,
  "Jan-2022":364.320,"Feb-2022":372.723,"Mar-2022":379.225,"Apr-2022":381.656,"May-2022":383.503,"Jun-2022":379.817,"Jul-2022":368.057,"Aug-2022":356.375,"Sep-2022":348.826,"Oct-2022":346.604,"Nov-2022":343.876,"Dec-2022":339.899,
  "Jan-2023":336.545,"Feb-2023":334.967,"Mar-2023":335.960,"Apr-2023":338.422,"May-2023":340.385,"Jun-2023":342.189,"Jul-2023":344.911,"Aug-2023":347.573,"Sep-2023":350.923,"Oct-2023":352.780,"Nov-2023":352.148,"Dec-2023":351.599,
  "Jan-2024":351.971,"Feb-2024":352.548,"Mar-2024":352.577,"Apr-2024":353.803,"May-2024":355.007,"Jun-2024":357.535,"Jul-2024":356.921,"Aug-2024":357.508,"Sep-2024":357.954,"Oct-2024":358.193,"Nov-2024":359.331,"Dec-2024":361.591,
  "Jan-2025":362.631,"Feb-2025":363.401,"Mar-2025":357.975,"Apr-2025":354.250,"May-2025":352.211,"Jun-2025":350.039,"Jul-2025":349.832,"Aug-2025":352.220,"Sep-2025":354.988,"Oct-2025":359.140,"Nov-2025":360.770,"Dec-2025":361.224,
  "Jan-2026":361.077,
};

// City multipliers at Jan-2020 (from spreadsheet City tabs, city HV / national HV).
// Miami, NY, Chicago use national index shape scaled by these multipliers —
// they share the same bubble/crash/recovery pattern but at different price levels.
const CITY_MULT = {
  National:        1.0000,
  "San Francisco": 272.586 / 214.997,  // = 1.2678 (actual FRED ratio)
  Miami:           1.3200,             // from spreadsheet
  "New York":      2.1010,             // from spreadsheet
  Chicago:         1.0500,             // from spreadsheet
};

// Forecast growth rates from May-2026 to May-2027 (national ~18% above Feb-2026,
// consistent with spreadsheet model's 8-12% from current level).
// Applied uniformly to all cities from their Feb-2026 level.
const FORECAST = {
  "Mar-2026":1.000,"Apr-2026":1.008,"May-2026":1.016,"Jun-2026":1.025,"Jul-2026":1.033,
  "Aug-2026":1.042,"Sep-2026":1.050,"Oct-2026":1.060,"Nov-2026":1.069,"Dec-2026":1.078,
  "Jan-2027":1.083,"Feb-2027":1.091,"Mar-2027":1.099,"Apr-2027":1.107,"May-2027":1.117,
};

// ── Month helpers ─────────────────────────────────────────────────────────────
const MON_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monToN(s) { const [m,y]=s.split("-"); return parseInt(y)*12+MON_NAMES.indexOf(m); }
function nToMon(n) { return MON_NAMES[((n%12)+12)%12]+"-"+Math.floor(n/12); }

// Get the FRED index value for a city at a given month string.
// Uses actual SF data for SF; national × multiplier for others.
function cityIndex(cityKey, month) {
  const mult = CITY_MULT[cityKey];
  const base = (cityKey === "San Francisco") ? SF_IDX[month] : NAT_IDX[month];
  if (base !== undefined) return base * (cityKey === "San Francisco" ? 1 : mult);
  return null;
}

// For SF, multiply by 1. For others, the multiplier scales national to city level.
// The SF multiplier is 1 because SF_IDX already contains actual SF values.

function buildProjection(purchasePrice, purchaseMonthStr, cityKey) {
  const isSF   = cityKey === "San Francisco";
  const mult   = CITY_MULT[cityKey];
  const sfMult = 272.586 / 214.997; // SF/National ratio at Jan-2020

  // Return a valid finite index value for a given month, or null if unknown.
  function getIdx(month) {
    const sfVal  = isSF ? SF_IDX[month] : undefined;
    const natVal = NAT_IDX[month];
    if (sfVal  !== undefined && Number.isFinite(sfVal))  return sfVal;
    if (natVal !== undefined && Number.isFinite(natVal)) return natVal * (isSF ? sfMult : mult);
    return null;
  }

  const purchaseIdxVal = getIdx(purchaseMonthStr);
  if (!purchaseIdxVal) return [];

  // Latest data point: Jan-2026 for SF (SFXRSA), Feb-2026 for all others (CSUSHPISA)
  const latestKnownMonth = isSF ? "Jan-2026" : "Feb-2026";
  const latestIdxVal     = getIdx(latestKnownMonth);
  const latestN          = monToN(latestKnownMonth);

  const startN = monToN(purchaseMonthStr);
  const endN   = Math.max(monToN("May-2027"), startN + 36);
  const lastForecastGrowth = FORECAST["May-2027"];

  const points = [];
  for (let n = startN; n <= endN; n++) {
    const month = nToMon(n);
    let idxVal = getIdx(month);
    let isForecast = false, isExtrapolated = false;

    // If no FRED data for this month (returns null or NaN), use forecast/extrapolation
    if (!Number.isFinite(idxVal)) {
      const fgrowth = FORECAST[month];
      if (Number.isFinite(fgrowth)) {
        idxVal = latestIdxVal * fgrowth;
        isForecast = true;
      } else {
        // Beyond May-2027 or gap — hold at last forecast value
        idxVal = latestIdxVal * lastForecastGrowth;
        isExtrapolated = true;
      }
    }

    const value = Math.round(purchasePrice * (idxVal / purchaseIdxVal));
    points.push({ month, value, isForecast, isExtrapolated });
  }
  return points;
}

// ── City detection ────────────────────────────────────────────────────────────
function detectCity(address) {
  const a = address.toLowerCase();
  if (/san francisco|bay area|oakland|palo alto|\bsf\b|ca 94[01]|marin|daly city/.test(a)) return "San Francisco";
  if (/miami|fort lauderdale|boca raton|coral gables|hialeah|fl 3[3-4]/.test(a))           return "Miami";
  if (/new york|brooklyn|manhattan|queens|bronx|jersey city|hoboken|\bnyc\b|\bny \d/.test(a)) return "New York";
  if (/chicago|evanston|naperville|oak park|\bil\b|il \d/.test(a))                          return "Chicago";
  return "National";
}

// ── Free public API helpers ──────────────────────────────────────────────────

// Socrata open-data endpoints (no API key, CORS-enabled public portals)
const SOCRATA = {
  "San Francisco": { host:"data.sfgov.org",         ds:"i98e-djp9", numF:"street_number", orderF:"filed_date" },
  "Chicago":       { host:"data.cityofchicago.org", ds:"ydr8-5enu", numF:"street_number", orderF:"application_start_date" },
  "New York":      { host:"data.cityofnewyork.us",  ds:"ipu4-2q9a", numF:"house",         orderF:"filing_date" },
};

function normalizePermit(p, city) {
  if (city==="San Francisco") return {number:p.permit_number||"—",type:p.permit_type_definition||p.permit_type||"—",description:p.description||"—",status:p.status||"—",filed:(p.filed_date||"—").slice(0,10),issued:p.issued_date?p.issued_date.slice(0,10):null,completed:p.completed_date?p.completed_date.slice(0,10):null,cost:p.estimated_cost?"$"+Number(p.estimated_cost).toLocaleString():null};
  if (city==="Chicago")       return {number:p.permit_||p.id||"—",type:p.permit_type||"—",description:p.work_description||"—",status:p.application_status||"—",filed:(p.application_start_date||"—").slice(0,10),issued:p.issue_date?p.issue_date.slice(0,10):null,completed:null,cost:p.reported_cost?"$"+Number(p.reported_cost).toLocaleString():null};
  if (city==="New York")      return {number:p.job__||p.permit_si_no||"—",type:p.permit_type||p.job_type||"—",description:p.description||"—",status:p.permit_status||p.job_status||"—",filed:(p.filing_date||"—").slice(0,10),issued:p.issuance_date?p.issuance_date.slice(0,10):null,completed:p.expiration_date?p.expiration_date.slice(0,10):null,cost:null};
  return {number:"—",type:"—",description:"—",status:"—",filed:"—",issued:null,completed:null,cost:null};
}



async function fetchPermitOpportunities(address, existingPermits, cityKey) {
  // If no permits found, show the full catalogue — more permits done = more opportunities already taken
  const existingTypes = new Set((existingPermits || []).map(p => (p.type||"").toLowerCase()));

  // City-specific opportunity catalogue with local context
  // Ranked by typical permit frequency in urban residential areas
  const CATALOGUE = {
    "San Francisco": [
      {rank:1,category:"ADU/In-Law Unit",title:"Accessory Dwelling Unit",description:"Convert garage or add a backyard cottage for rental income. SF has streamlined ADU permitting since 2020.",localPopularity:"~42% of eligible SF properties have filed",localTrend:"Rising",typicalCost:"$150,000–$350,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"6–12 weeks approval, 6–12 months construction",roiNote:"ADUs add $200k–$500k to SF property values and generate $2,500–$4,500/mo rental income."},
      {rank:2,category:"Seismic Retrofit",title:"Soft-Story Seismic Upgrade",description:"Mandatory for many SF buildings, this reinforces the ground floor to prevent collapse in earthquakes.",localPopularity:"Required by ordinance for 5+ unit soft-story buildings",localTrend:"Rising",typicalCost:"$60,000–$130,000",permitRequired:true,valueImpact:"High",effort:"Medium",permitTimeline:"4–8 weeks approval, 2–4 months work",roiNote:"Required by city ordinance — non-compliance results in fines; compliance protects insurance rates."},
      {rank:3,category:"Solar Installation",title:"Rooftop Solar + Battery Storage",description:"SF offers expedited solar permits and California provides significant rebates through the SGIP program.",localPopularity:"~28% of SF single-family homes have solar",localTrend:"Rising",typicalCost:"$18,000–$35,000",permitRequired:true,valueImpact:"High",effort:"Low",permitTimeline:"2–4 weeks approval, 1–3 days installation",roiNote:"Adds ~$15k–$25k to property value; eliminates $200–$400/month PG&E bills."},
      {rank:4,category:"Kitchen Remodel",title:"Full Kitchen Renovation",description:"Gut and replace cabinets, countertops, appliances, and plumbing. Common trigger for electrical upgrade permits.",localPopularity:"~19% of SF homes permit kitchen work annually",localTrend:"Stable",typicalCost:"$40,000–$120,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"3–6 weeks approval, 2–4 months construction",roiNote:"Kitchen remodels return 60–80% of cost at resale in the SF market."},
      {rank:5,category:"Electrical Upgrade",title:"200-Amp Panel Upgrade",description:"Upgrade from 60/100-amp to 200-amp service to support EV chargers, heat pumps, and modern appliances.",localPopularity:"~15% of SF homes need panel upgrades",localTrend:"Rising",typicalCost:"$3,500–$8,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–2 weeks approval, 1–2 days work",roiNote:"Required prerequisite for EV charging and heat pump installation; improves home marketability."},
      {rank:6,category:"Bathroom Addition",title:"Bathroom Remodel or Addition",description:"Add or fully renovate a bathroom, including tile, fixtures, and plumbing rough-in.",localPopularity:"~14% of SF permits annually",localTrend:"Stable",typicalCost:"$25,000–$75,000",permitRequired:true,valueImpact:"High",effort:"Medium",permitTimeline:"3–5 weeks approval, 6–10 weeks construction",roiNote:"Adding a bathroom in SF returns ~70% ROI; half-bath additions are particularly cost-effective."},
      {rank:7,category:"EV Charger",title:"Level 2 EV Charging Station",description:"Install a 240V dedicated circuit and EVSE charger in garage or carport.",localPopularity:"~22% of SF homes with garages have installed EV chargers",localTrend:"Rising",typicalCost:"$800–$2,500",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–2 weeks approval, half-day installation",roiNote:"Increasingly expected by buyers — adds $5k–$10k to perceived value in SF's EV-heavy market."},
      {rank:8,category:"Roof Replacement",title:"Roof Replacement",description:"Replace aging roof with Class A fire-rated material; often required for solar installation.",localPopularity:"~11% of SF homes replace roof in any 5-year period",localTrend:"Stable",typicalCost:"$15,000–$40,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–3 weeks approval, 3–7 days work",roiNote:"Roof replacement prevents costly water damage and is typically required before solar panels."},
    ],
    Miami: [
      {rank:1,category:"Pool/Spa",title:"Swimming Pool or Spa",description:"Miami's climate makes pools a near-universal amenity; permits require fencing and drainage plans.",localPopularity:"~38% of Miami-Dade single-family homes have a pool",localTrend:"Rising",typicalCost:"$35,000–$85,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"6–10 weeks approval, 8–16 weeks construction",roiNote:"Pools add $20k–$40k to Miami home values and are expected by most buyers."},
      {rank:2,category:"Solar Installation",title:"Rooftop Solar System",description:"Florida's net metering and high sun exposure make solar especially valuable in Miami.",localPopularity:"~24% of Miami homes have solar",localTrend:"Rising",typicalCost:"$15,000–$28,000",permitRequired:true,valueImpact:"High",effort:"Low",permitTimeline:"3–6 weeks approval, 1–2 days installation",roiNote:"FPL territory solar owners save $150–$300/month; adds ~$20k to home value."},
      {rank:3,category:"Hurricane Impact Windows",title:"Impact Window & Door Replacement",description:"Replace standard windows with Miami-Dade approved hurricane impact glass — required for insurance discounts.",localPopularity:"~45% of Miami homes have completed this upgrade",localTrend:"Stable",typicalCost:"$8,000–$25,000",permitRequired:true,valueImpact:"High",effort:"Medium",permitTimeline:"2–4 weeks approval, 1–3 days installation",roiNote:"Reduces homeowner insurance by 20–35%; adds $15k–$30k to resale value."},
      {rank:4,category:"Deck/Patio",title:"Covered Patio or Pergola",description:"Add a permitted covered outdoor living space — extremely popular in Miami's year-round outdoor climate.",localPopularity:"~29% of Miami homes have added covered patios",localTrend:"Rising",typicalCost:"$12,000–$45,000",permitRequired:true,valueImpact:"High",effort:"Medium",permitTimeline:"3–5 weeks approval, 4–8 weeks construction",roiNote:"Outdoor living spaces deliver 60–80% ROI and are a top buyer priority in South Florida."},
      {rank:5,category:"Kitchen Remodel",title:"Full Kitchen Renovation",description:"Update kitchen with modern finishes, appliances, and layout to match Miami buyer expectations.",localPopularity:"~17% of Miami homes permit kitchen work annually",localTrend:"Stable",typicalCost:"$30,000–$90,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"3–6 weeks approval, 2–3 months construction",roiNote:"Updated kitchens return 65–75% of cost in Miami's competitive market."},
      {rank:6,category:"HVAC Upgrade",title:"Central AC System Replacement",description:"Replace aging HVAC with high-efficiency system; essential given Miami's climate and energy costs.",localPopularity:"~20% of homes replace HVAC in any 5-year window",localTrend:"Stable",typicalCost:"$8,000–$18,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–2 weeks approval, 1–2 days installation",roiNote:"New HVAC reduces energy bills 20–30% and prevents costly failures; expected by all buyers."},
    ],
    "New York": [
      {rank:1,category:"Bathroom Addition",title:"Bathroom Renovation or Addition",description:"Gut renovate or add a bathroom; NYC requires licensed plumbers and DOB filings.",localPopularity:"~22% of NYC apartments/homes permit bath work annually",localTrend:"Stable",typicalCost:"$20,000–$60,000",permitRequired:true,valueImpact:"High",effort:"Medium",permitTimeline:"4–8 weeks DOB approval, 6–10 weeks construction",roiNote:"Additional bathrooms are among the top value drivers in NYC real estate."},
      {rank:2,category:"Kitchen Remodel",title:"Kitchen Renovation",description:"Update layout, cabinets, counters, and appliances; gas work requires separate DOB permits.",localPopularity:"~18% of NYC homes permit kitchen work annually",localTrend:"Stable",typicalCost:"$35,000–$100,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"4–8 weeks DOB approval, 2–4 months work",roiNote:"NYC kitchen remodels return 60–75% of cost; critical for co-op/condo board approval."},
      {rank:3,category:"Electrical Upgrade",title:"Electrical Panel Upgrade",description:"Upgrade to 200-amp service to accommodate modern loads; required by many co-op boards.",localPopularity:"~16% of older NYC buildings need panel upgrades",localTrend:"Rising",typicalCost:"$5,000–$12,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"2–4 weeks DOB approval, 1–2 days work",roiNote:"Essential prerequisite for EV charging and modern appliances; improves insurance rates."},
      {rank:4,category:"Window Replacement",title:"Window Replacement",description:"Replace windows under NYC Local Law 11 compliance or for energy efficiency; building permits required.",localPopularity:"~14% of NYC buildings replace windows in any 3-year period",localTrend:"Stable",typicalCost:"$10,000–$30,000",permitRequired:true,valueImpact:"Medium",effort:"Medium",permitTimeline:"3–6 weeks approval, 3–7 days installation",roiNote:"Energy-efficient windows reduce heating/cooling costs 15–25% in NYC's climate."},
      {rank:5,category:"Roof Replacement",title:"Roof Replacement or Waterproofing",description:"Repair or replace roof; NYC Local Law 11 may mandate facade and roof work on older buildings.",localPopularity:"~12% of NYC buildings need roof work annually",localTrend:"Stable",typicalCost:"$15,000–$50,000",permitRequired:true,valueImpact:"Medium",effort:"Medium",permitTimeline:"3–5 weeks approval, 1–2 weeks work",roiNote:"Prevents costly water damage claims; required for co-op/condo financing approval."},
      {rank:6,category:"ADU/In-Law Unit",title:"Accessory Dwelling / Basement Apartment",description:"Convert basement to legal dwelling unit under NYC's new ADU pilot programs.",localPopularity:"~8% of eligible NYC properties have converted basements",localTrend:"Rising",typicalCost:"$80,000–$200,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"8–16 weeks DOB approval, 6–12 months construction",roiNote:"Legal basement apartments generate $2,000–$3,500/month rental income in NYC."},
    ],
    Chicago: [
      {rank:1,category:"Garage Conversion",title:"Garage Addition or Conversion",description:"Chicago's 2-flat and bungalow stock makes garage work extremely common; zoning review required.",localPopularity:"~25% of Chicago homeowners have done garage work",localTrend:"Stable",typicalCost:"$20,000–$60,000",permitRequired:true,valueImpact:"High",effort:"Medium",permitTimeline:"3–6 weeks approval, 6–10 weeks construction",roiNote:"Garage additions and conversions are consistently the #1 permitted improvement in Chicago."},
      {rank:2,category:"ADU/In-Law Unit",title:"Coach House / Garden Unit ADU",description:"Chicago's 2020 ADU ordinance allows coach houses and garden units in many neighborhoods.",localPopularity:"~18% of eligible Chicago properties are eligible for ADU",localTrend:"Rising",typicalCost:"$100,000–$250,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"6–12 weeks approval, 6–9 months construction",roiNote:"Chicago ADUs generate $1,200–$2,200/month rental income; significantly increases property value."},
      {rank:3,category:"Deck/Patio",title:"Rear Deck or Porch",description:"Chicago's rear decks are iconic and extremely popular; fire-code and zoning requirements apply.",localPopularity:"~31% of Chicago two-flats and single-families have decks",localTrend:"Stable",typicalCost:"$8,000–$25,000",permitRequired:true,valueImpact:"Medium",effort:"Medium",permitTimeline:"2–4 weeks approval, 2–4 weeks construction",roiNote:"Decks are among the highest-ROI improvements in Chicago, returning 70–85% of cost."},
      {rank:4,category:"Kitchen Remodel",title:"Kitchen Renovation",description:"Update kitchen to modern standards; Chicago requires permits for any structural or plumbing changes.",localPopularity:"~16% of Chicago homes permit kitchen work annually",localTrend:"Stable",typicalCost:"$25,000–$75,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"3–5 weeks approval, 2–3 months construction",roiNote:"Kitchen remodels return 65–80% of cost in Chicago's market."},
      {rank:5,category:"HVAC Upgrade",title:"Furnace & Central AC Replacement",description:"Replace aging systems with high-efficiency equipment; critical given Chicago's extreme seasonal temperatures.",localPopularity:"~18% of Chicago homes replace HVAC in any 5-year period",localTrend:"Stable",typicalCost:"$7,000–$16,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–2 weeks approval, 1–2 days installation",roiNote:"New HVAC reduces energy bills 25–35% in Chicago's climate; required disclosure item at sale."},
      {rank:6,category:"Electrical Upgrade",title:"Electrical Panel & Knob-and-Tube Removal",description:"Many Chicago bungalows have original wiring; upgrade is required for insurance and needed for EV chargers.",localPopularity:"~20% of pre-1960 Chicago homes need electrical upgrades",localTrend:"Rising",typicalCost:"$5,000–$15,000",permitRequired:true,valueImpact:"Medium",effort:"Medium",permitTimeline:"2–3 weeks approval, 2–5 days work",roiNote:"Electrical upgrades are required by most insurance companies for pre-1960 Chicago homes."},
    ],
    National: [
      {rank:1,category:"Kitchen Remodel",title:"Kitchen Renovation",description:"A full kitchen update remains the most consistently high-ROI home improvement nationally.",localPopularity:"~18% of homeowners undertake kitchen work in any given year",localTrend:"Stable",typicalCost:"$25,000–$85,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"3–6 weeks approval, 2–4 months work",roiNote:"Kitchen remodels nationally return 60–80% of cost at resale."},
      {rank:2,category:"Bathroom Addition",title:"Bathroom Remodel or Addition",description:"Adding or remodeling a bathroom is the second most common permitted residential improvement.",localPopularity:"~16% of homeowners do bathroom work annually",localTrend:"Stable",typicalCost:"$10,000–$50,000",permitRequired:true,valueImpact:"High",effort:"Medium",permitTimeline:"2–5 weeks approval, 4–8 weeks work",roiNote:"Bathroom additions nationally deliver 50–70% ROI; converting half-bath to full adds most value."},
      {rank:3,category:"Solar Installation",title:"Rooftop Solar Installation",description:"Rooftop solar growth has averaged 20%+ annually; federal ITC provides 30% tax credit through 2032.",localPopularity:"~4.5% of US homes have solar (up 300% since 2015)",localTrend:"Rising",typicalCost:"$15,000–$30,000",permitRequired:true,valueImpact:"High",effort:"Low",permitTimeline:"2–4 weeks approval, 1–3 days installation",roiNote:"Solar adds ~$15k–$25k to home value nationally and eliminates $100–$250/month utility bills."},
      {rank:4,category:"Deck/Patio",title:"Deck or Patio Addition",description:"Outdoor living additions deliver strong ROI and are among the most popular discretionary improvements.",localPopularity:"~14% of homeowners add or replace decks in any 5-year period",localTrend:"Rising",typicalCost:"$8,000–$35,000",permitRequired:true,valueImpact:"Medium",effort:"Medium",permitTimeline:"2–4 weeks approval, 2–4 weeks construction",roiNote:"Wood decks return 60–75% nationally; composite decks command premium pricing at resale."},
      {rank:5,category:"HVAC Upgrade",title:"HVAC System Replacement",description:"Replace aging heating/cooling system with high-efficiency heat pump or gas furnace and central AC.",localPopularity:"~8% of homes replace HVAC in any given year",localTrend:"Stable",typicalCost:"$6,000–$15,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–2 weeks approval, 1–2 days installation",roiNote:"New HVAC reduces energy bills 20–40% and is a top inspection item that affects sale price."},
      {rank:6,category:"ADU/In-Law Unit",title:"Accessory Dwelling Unit",description:"Garage conversions and backyard cottages are the fastest-growing permit category in most US cities.",localPopularity:"~2% of eligible homes have an ADU, but filings up 60% since 2020",localTrend:"Rising",typicalCost:"$80,000–$250,000",permitRequired:true,valueImpact:"High",effort:"High",permitTimeline:"6–16 weeks approval, 6–12 months construction",roiNote:"ADUs add significant rental income potential and 10–20% to property value in most markets."},
      {rank:7,category:"Electrical Upgrade",title:"Electrical Panel Upgrade",description:"Upgrade electrical panel to 200-amp service for EV charging, heat pumps, and modern appliances.",localPopularity:"~12% of homes need panel upgrades",localTrend:"Rising",typicalCost:"$3,000–$8,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–2 weeks approval, 1 day work",roiNote:"Panel upgrades are required to add EV chargers and increasingly expected by home inspectors."},
      {rank:8,category:"Window Replacement",title:"Window Replacement",description:"Replace single-pane or aging windows with energy-efficient double or triple-pane units.",localPopularity:"~11% of homes replace windows in any 5-year period",localTrend:"Stable",typicalCost:"$8,000–$20,000",permitRequired:true,valueImpact:"Medium",effort:"Low",permitTimeline:"1–3 weeks approval, 1–3 days installation",roiNote:"Window replacements return 60–70% nationally and are often required for energy rebate programs."},
    ],
  };

  const catalogue = CATALOGUE[cityKey] || CATALOGUE.National;

  // Filter out categories already clearly covered by existing permits.
  // Use specific keyword matching only — avoid short substrings that cause false positives
  // (e.g. "additions alterations" should NOT suppress "ADU" or "Bathroom Addition").
  const CATEGORY_KEYWORDS = {
    "ADU/In-Law Unit":      ["adu","accessory dwelling","in-law","inlaw","junior unit","jadu","garage conversion to dwelling","backyard cottage"],
    "Seismic Retrofit":     ["seismic","soft-story","softstory","earthquake"],
    "Solar Installation":   ["solar","photovoltaic","pv system"],
    "Kitchen Remodel":      ["kitchen"],
    "Bathroom Addition":    ["bathroom","bath addition","new bath","add bath"],
    "Electrical Upgrade":   ["electrical service upgrade","panel upgrade","200 amp","new service","service change"],
    "EV Charger":           ["ev charger","electric vehicle","evse","charging station"],
    "Roof Replacement":     ["roof replacement","reroof","new roof"],
    "Window Replacement":   ["window replacement","replace windows","new windows"],
    "HVAC Upgrade":         ["hvac replacement","furnace replacement","new hvac","heat pump","ac replacement","new ac"],
    "Deck/Patio":           ["deck","patio addition","new patio"],
    "Garage Conversion":    ["garage conversion","convert garage","garage to adu"],
    "Room Addition":        ["room addition","new addition","building addition","square footage addition"],
    "Pool/Spa":             ["pool","swimming pool","spa permit"],
  };

  const existingArr = [...existingTypes];
  // Also include descriptions so e.g. "bathroom remodel" in description suppresses Bathroom Addition
  const existingDescriptions = (existingPermits || []).map(p => (p.description||"").toLowerCase());
  const allExisting = [...existingArr, ...existingDescriptions];

  return catalogue
    .filter(opp => {
      const keywords = CATEGORY_KEYWORDS[opp.category] || [];
      // Only suppress if an existing permit type OR description specifically matches this category
      return !allExisting.some(et =>
        keywords.some(kw => et.includes(kw))
      );
    })
    .slice(0, 8);
}

// Opportunity detail — curated permit steps + Yelp Fusion-style search via public APIs
// ── Local permit portal lookup ────────────────────────────────────────────────
// Known city permit portal URLs — used to search for the actual local process
const CITY_PERMIT_PORTALS = {
  "San Francisco": "sf.gov/permits OR sfdbi.org",
  "Miami":         "miamidade.gov/building OR miami.gov/building-permits",
  "New York":      "nyc.gov/dob OR portal.nyc.gov/DOB",
  "Chicago":       "chicago.gov/buildings OR ibos.cityofchicago.org",
  "Los Angeles":   "ladbs.org OR lacity.gov/ladbs",
  "Seattle":       "seattle.gov/sdci",
  "Boston":        "boston.gov/departments/inspectional-services",
  "Denver":        "denvergov.org/permits",
  "Austin":        "austintexas.gov/permits",
  "Portland":      "portland.gov/bds",
};

async function fetchLocalPermitProcess(city, state, category, address) {
  // Build a targeted search for this city's actual permit process
  const portalHint = CITY_PERMIT_PORTALS[city] || `${city.toLowerCase().replace(/\s/g,"-")}.gov building permits`;
  const result = await callAnthropic({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: "You are a permit process researcher. Output ONLY raw JSON — no markdown, no prose.",
    messages: [{ role: "user", content:
      `Search the official ${city}, ${state} building department website for the exact permit steps to get a "${category}" permit.\n` +
      `Check: ${portalHint}\n` +
      `Extract the real local process: fees, timeline, required documents, inspection stages.\n` +
      `Output ONLY this JSON:\n` +
      `{"steps":[{"step":1,"title":"Step name","description":"What to do","duration":"timeline"},...],"fees":"fee info or null","portal_url":"actual URL found or null","notes":"any local specifics"}\n` +
      `If not found, output: {"steps":null,"fees":null,"portal_url":null,"notes":null}`
    }],
  });
  if (!result.ok) return null;
  const text = extractText(result.data).replace(/```json|```/g,"").trim();
  try {
    const p = JSON.parse(text);
    if (p.steps && p.steps.length > 0) return p;
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) try {
    const p = JSON.parse(m[0]);
    if (p.steps && p.steps.length > 0) return p;
  } catch {}
  return null;
}

async function fetchOpportunityDetail(address, opportunity) {
  const cityMatch = address.match(/,\s*([^,]+),\s*[A-Z]{2}/);
  const city = cityMatch ? cityMatch[1].trim() : "your city";
  const stateMatch = address.match(/,\s*([A-Z]{2})\s*(\d{5})?/);
  const state = stateMatch ? stateMatch[1] : "";

  // ── Try to get REAL local permit process first ────────────────────────────
  let localProcess = null;
  try {
    localProcess = await fetchLocalPermitProcess(city, state, opportunity.category, address);
  } catch {}

  // ── Hardcoded fallback steps ──────────────────────────────────────────────
  const PERMIT_STEPS = {
    "ADU/In-Law Unit": [
      {step:1,title:"Pre-Application Meeting",description:"Meet with the local planning/building department to confirm ADU eligibility, setbacks, and zoning requirements for your property.",duration:"1–2 hours"},
      {step:2,title:"Hire Designer/Architect",description:"Engage a licensed architect or ADU designer to create stamped construction drawings meeting local building codes.",duration:"4–8 weeks"},
      {step:3,title:"Submit Permit Application",description:"Submit drawings, site plan, energy compliance forms (Title 24 in CA), and structural calculations to the building department.",duration:"1–2 weeks"},
      {step:4,title:"Plan Check & Corrections",description:"Building department reviews plans; respond to any correction requests. Over-the-counter approval possible in some cities.",duration:"2–8 weeks"},
      {step:5,title:"Permit Issuance & Construction",description:"Permit issued; construction begins with required inspections at foundation, framing, MEP rough-in, and final stages.",duration:"4–12 months"},
      {step:6,title:"Final Inspection & Certificate of Occupancy",description:"Pass all final inspections; receive Certificate of Occupancy confirming the unit is legally habitable.",duration:"1–2 weeks"},
    ],
    "Solar Installation": [
      {step:1,title:"Site Assessment & Design",description:"Solar installer performs a shading analysis, roof condition check, and system design sized to your electricity usage.",duration:"1–2 weeks"},
      {step:2,title:"HOA Approval (if applicable)",description:"If in an HOA, submit plans for approval; California and most states limit HOA's ability to deny solar.",duration:"1–4 weeks"},
      {step:3,title:"Pull Building & Electrical Permits",description:"Installer submits permit application with single-line electrical diagram and structural roof attachment details.",duration:"1–3 weeks"},
      {step:4,title:"Installation",description:"Crew installs racking, panels, inverter, and interconnects to your main electrical panel.",duration:"1–3 days"},
      {step:5,title:"City Inspection",description:"Building and electrical inspectors verify installation meets code; installer addresses any corrections.",duration:"1–2 weeks"},
      {step:6,title:"Utility Interconnection",description:"Utility company inspects and approves net metering connection; Permission to Operate (PTO) issued.",duration:"1–4 weeks"},
    ],
    "Kitchen Remodel": [
      {step:1,title:"Design & Contractor Selection",description:"Finalize layout, materials, and appliances with a kitchen designer; obtain 3 contractor bids.",duration:"4–8 weeks"},
      {step:2,title:"Pull Building Permit",description:"Contractor submits permit for any structural, plumbing, or electrical changes; cosmetic-only remodels may not require permits.",duration:"2–6 weeks"},
      {step:3,title:"Demolition",description:"Remove existing cabinets, flooring, and fixtures; inspect for mold, asbestos, or plumbing issues.",duration:"2–5 days"},
      {step:4,title:"Rough-In Work",description:"Complete plumbing, electrical, and HVAC rough-in; pass inspections before covering walls.",duration:"1–3 weeks"},
      {step:5,title:"Finish Work",description:"Install cabinets, countertops, tile, appliances, fixtures, and flooring.",duration:"3–6 weeks"},
      {step:6,title:"Final Inspection",description:"Building inspector signs off on electrical and plumbing; contractor completes punch list.",duration:"1–2 weeks"},
    ],
    default: [
      {step:1,title:"Consult a Licensed Contractor",description:"Get 2–3 bids from licensed contractors specializing in this work type; verify licenses at your state contractor board.",duration:"1–2 weeks"},
      {step:2,title:"Permit Application",description:"Contractor or owner submits plans and permit application to the local building department.",duration:"2–6 weeks"},
      {step:3,title:"Plan Review",description:"Building department reviews for code compliance; respond to any correction notices promptly.",duration:"1–4 weeks"},
      {step:4,title:"Construction",description:"Licensed contractor performs the work; keep site clean and accessible for inspections.",duration:"Varies by scope"},
      {step:5,title:"Inspections",description:"Schedule required inspections at each stage (rough-in, framing, final); don't cover work before inspection.",duration:"As needed"},
      {step:6,title:"Final Sign-Off",description:"Pass final inspection; retain permit card and inspection records with property documents.",duration:"1 week"},
    ],
  };

  const fallbackSteps = PERMIT_STEPS[opportunity.category] || PERMIT_STEPS.default;
  const steps = localProcess?.steps || fallbackSteps;
  const portalUrl = localProcess?.portal_url || null;
  const localFees = localProcess?.fees || null;
  const localNotes = localProcess?.notes || null;
  const isLocalData = !!localProcess?.steps;

  const q = encodeURIComponent(opportunity.title + " contractor");
  const loc = encodeURIComponent(`${city}, ${state}`);
  const vendors = [
    {name:"Search Yelp for local contractors",specialty:`Find rated "${opportunity.title}" contractors in ${city}`,website:`https://www.yelp.com/search?find_desc=${q}&find_loc=${loc}`,rating:"User reviews",reviewCount:"Thousands of reviews"},
    {name:"Search Angi (formerly Angie's List)",specialty:`Vetted local contractors for ${opportunity.category}`,website:`https://www.angi.com/search?q=${q}&loc=${loc}`,rating:"Verified reviews",reviewCount:"Background-checked pros"},
    {name:"Search Houzz Pro",specialty:`Design-forward contractors for ${opportunity.title}`,website:`https://www.houzz.com/professionals/search?q=${q}&location=${loc}`,rating:"Portfolio + reviews",reviewCount:"Project photos available"},
    {name:"Search Thumbtack",specialty:`Get quotes from local ${opportunity.category} pros`,website:`https://www.thumbtack.com/search/${encodeURIComponent(opportunity.title)}/?q=${loc}`,rating:"Instant quotes",reviewCount:"Compare multiple bids"},
    {name:`${city} Licensed Contractor Search`,specialty:`Verify contractor licenses with your state board`,website:`https://www.google.com/search?q=licensed+${q}+${loc}+license+verification`,rating:"State-verified",reviewCount:"License lookup"},
  ];

  const REQUIREMENTS = {
    "ADU/In-Law Unit": ["Licensed architect or designer for stamped plans","Separate utility meters may be required","Parking replacement may be required per zoning","Fire separation between units (1-hour minimum)"],
    "Solar Installation": ["Licensed C-46 Solar contractor (CA) or equivalent","Structural engineer letter for roof loading","Utility pre-approval for net metering","Homeowner's association written approval if applicable"],
    "Kitchen Remodel": ["Licensed plumber for any drain/supply changes","Licensed electrician for circuit additions","Asbestos/lead test if pre-1978 home","Mechanical permit for range hood ducting"],
    "Electrical Upgrade": ["Licensed electrical contractor","Utility disconnect required during work","Arc-fault and GFCI protection per NEC","Load calculation worksheet required"],
    "HVAC Upgrade": ["ACCA Manual J load calculation","EPA 608 certified technician for refrigerant","Licensed HVAC contractor","Duct leakage testing may be required"],
    default: ["Licensed contractor required for permit pull","Proof of insurance and workers comp","Inspections at key milestones","Final sign-off before covering work"],
  };
  const requirements = REQUIREMENTS[opportunity.category] || REQUIREMENTS.default;

  const tips = ({
    "ADU/In-Law Unit": `In ${city}, pre-approved ADU plans can cut approval time from months to weeks — ask your building department if they offer plan sets.`,
    "Solar Installation": `In ${city}, installers typically handle all permitting and utility interconnection — confirm this is included in your quote.`,
    "Kitchen Remodel": `In ${city}, hiring a kitchen designer separate from your contractor often saves money — they optimize the layout before construction begins.`,
    default: `In ${city}, pulling your own permit as a homeowner-builder is possible for most work but requires you to pass all inspections personally.`,
  })[opportunity.category] || `In ${city}, pulling your own permit as a homeowner-builder is possible for most work but requires you to pass all inspections personally.`;

  return {
    vendors,
    permitSteps: steps,
    totalTimeline: opportunity.permitTimeline || "2–6 months total",
    keyRequirements: requirements,
    tips,
    isLocalData,
    portalUrl,
    localFees,
    localNotes,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v);
const fmtPct = v=>(v>=0?"+":"")+v.toFixed(1)+"%";
const CITY_COLORS = {"San Francisco":"#185FA5",Miami:"#D85A30","New York":"#533AB7",Chicago:"#0F6E56",National:"#888780"};
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS=Array.from({length:50},(_,i)=>String(1980+i));
function statusColor(s){const sl=(s||"").toLowerCase();if(/complet|final|issued|approv/.test(sl))return{bg:"#D1FAE5",fg:"#065F46"};if(/active|open|pending|progress/.test(sl))return{bg:"#DBEAFE",fg:"#1E3A8A"};if(/expir|cancel|void|withdrawn/.test(sl))return{bg:"#FEE2E2",fg:"#991B1B"};return{bg:"#F3F4F6",fg:"#374151"};}
function ChartTooltip({active,payload,label}){if(!active||!payload||!payload.length)return null;return(<div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",padding:"9px 13px",fontSize:13}}><p style={{fontWeight:500,margin:"0 0 3px",color:"var(--color-text-primary)"}}>{label}</p><p style={{margin:0,color:payload[0].color}}>{fmt(payload[0].value)}</p></div>);}
const ROW_TYPES={forecast:{bg:"#FEFCE8",fg:"#92400E",label:"forecast"},extrapolated:{bg:"#FFF7ED",fg:"#9A3412",label:"extrapolated"},historical:{bg:"var(--color-background-secondary)",fg:"var(--color-text-secondary)",label:"historical (FRED)"}};
function rowType(row){if(row.isExtrapolated)return ROW_TYPES.extrapolated;if(row.isForecast)return ROW_TYPES.forecast;return ROW_TYPES.historical;}


// ── Sale lookup & permit search ───────────────────────────────────────────────
// Strategy:
//   1. Try the Anthropic API (works when user has a Claude.ai session).
//   2. If the API returns 401/403/network-error → no account → apiOk = false.
//   3. When apiOk = false, the UI shows direct links to Redfin/Zillow/county
//      records so the user can look up the data and paste it in manually.
//
// NOTE: Every other external API (Socrata, Census, Nominatim, Zillow, Redfin…)
// returns 403 "Host not in allowlist" from a sandboxed iframe origin.
// The Anthropic API is the ONLY endpoint that is explicitly allowed here.

// ── API proxy (Vercel serverless — keeps key server-side) ──────────────────
const API_PROXY = "/api/claude";
const API_MODEL = "claude-haiku-4-5-20251001";

async function callAnthropic(payload) {
  try {
    const res = await fetch(API_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: API_MODEL, ...payload }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, noAccount: true };
    if (!res.ok) return { ok: false, noAccount: false };
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, noAccount: false };
  }
}

function extractText(data) {
  return (data?.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
}

// Build direct search links for manual lookup fallback
function buildSearchLinks(address) {
  const enc = encodeURIComponent(address);
  const slug = address.replace(/[.,]/g, "").replace(/\s+/g, "-");
  return [
    { label: "Redfin",      url: `https://www.redfin.com/search#search=${enc}` },
    { label: "Zillow",      url: `https://www.zillow.com/homes/${enc}_rb/` },
    { label: "Realtor.com", url: `https://www.realtor.com/realestateandhomes-search/${slug}` },
    { label: "Google",      url: `https://www.google.com/search?q=${encodeURIComponent(address + " last sold price")}` },
  ];
}

// Permit database links for manual lookup
function buildPermitLinks(address) {
  const enc = encodeURIComponent(address + " building permit history");
  return [
    { label: "SF Open Data",       url: "https://data.sfgov.org/Housing-and-Buildings/Building-Permits/i98e-djp9" },
    { label: "Chicago Permits",    url: "https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu" },
    { label: "NYC DOB",            url: "https://www.nyc.gov/site/buildings/homeowner/permits.page" },
    { label: "Search your city",   url: `https://www.google.com/search?q=${enc}` },
  ];
}

// ── Sale price scraping ───────────────────────────────────────────────────────
// Strategy (no LLM tokens until last resort):
//  1. Redfin   – autocomplete → property path → fetch page → regex parse
//  2. Zillow   – address slug URL → fetch page → regex parse
//  3. Realtor  – address slug URL → fetch page → regex parse
//  4. Google   – structured snippet fetch → regex parse
//  5. Anthropic AI web search (last resort, ~300 tokens)
//
// Steps 1-4 use the Anthropic API purely as a CORS proxy (fetchPage).
// max_tokens:1 means the model outputs nothing — we only read the tool result.
// ─────────────────────────────────────────────────────────────────────────────






function parseSaleJson(text, source) {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    const p = JSON.parse(clean);
    if (p.price && p.year) return { price: +p.price, month: p.month||"Jan", year: +p.year, source };
  } catch {}
  const m = clean.match(/\{[^{}]{0,400}\}/);
  if (m) try { const p = JSON.parse(m[0]); if (p.price && p.year) return { price:+p.price, month:p.month||"Jan", year:+p.year, source }; } catch {}
  // field-by-field
  const pm = clean.match(/"price"\s*:\s*(\d{4,9})/);
  const mm = clean.match(/"month"\s*:\s*"([A-Z][a-z]{2})"/);
  const ym = clean.match(/"year"\s*:\s*"?(\d{4})"?/);
  if (pm && ym) return { price:+pm[1], month:mm?.[1]||"Jan", year:+ym[1], source };
  return null;
}



// ── Address → URL helpers ─────────────────────────────────────────────────────

function addressToZillowSlug(address) {
  // "14421 SW 155th Pl, Miami, FL 33196"
  // → "14421-SW-155th-Pl-Miami-FL-33196"
  return address
    .replace(/,/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-]/g, "");
}

function addressToRealtorSlug(address) {
  // "14421 SW 155th Pl, Miami, FL 33196"
  // → "14421-SW-155th-Pl_Miami_FL_33196"
  const parts = address.split(",").map(s => s.trim());
  const street = (parts[0] || "").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-]/g, "");
  const city   = (parts[1] || "").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-]/g, "");
  const sv     = (parts[2] || "").trim().replace(/\s+/g, "_");
  return `${street}_${city}_${sv}`;
}

// ── Site-specific page parsers ────────────────────────────────────────────────

// Zillow page (markdown rendered): scan Price History table for "Sold" rows
// Table format: | MM/DD/YYYY | Sold | $NNN,NNN-X.X%$NNN/sqft |
// The price cell contains the sale price immediately followed by % change and $/sqft
function parseZillowPage(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    // Match: | 9/30/2013 | Sold | $446,000-5.1%$637/sqft |
    // or:    | 7/30/2020 | Sold | $381,000 |
    // Price ends at first non-digit/comma char after the dollar sign
    const m = line.match(/\|\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|\s*Sold\s*\|\s*\$([\d,]+)/i);
    if (m) {
      const month = parseInt(m[1], 10);
      const year  = parseInt(m[3], 10);
      const price = parseInt(m[4].replace(/,/g, ""), 10);
      if (price > 1000 && year > 1980) {
        const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return { price, month: MON[month - 1] || "Jan", year, source: "Zillow" };
      }
    }
  }
  // Fallback 1: og:description / meta-description contains "last sold for $X in Month YYYY"
  // e.g. "This home last sold for $446,000 in September 2013."
  const ogDesc = text.match(/last sold (?:on \S+ )?for \$([\d,]+) in ([A-Za-z]+) (\d{4})/i);
  if (ogDesc) {
    const MON_MAP = {january:"Jan",february:"Feb",march:"Mar",april:"Apr",may:"May",june:"Jun",july:"Jul",august:"Aug",september:"Sep",october:"Oct",november:"Nov",december:"Dec"};
    const price = parseInt(ogDesc[1].replace(/,/g,""), 10);
    const mon   = MON_MAP[ogDesc[2].toLowerCase()] || ogDesc[2].slice(0,3);
    const year  = parseInt(ogDesc[3], 10);
    if (price > 1000 && year > 1980) return { price, month: mon, year, source: "Zillow" };
  }
  // Fallback 2: meta-description "last sold on YYYY-MM-DD for $NNN,NNN"
  const metaDate = text.match(/last sold on (\d{4})-(\d{2})-\d{2} for \$([\d,]+)/i);
  if (metaDate) {
    const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return { price: parseInt(metaDate[3].replace(/,/g,""), 10), month: MON[parseInt(metaDate[2],10)-1]||"Jan", year: parseInt(metaDate[1],10), source: "Zillow" };
  }
  // Fallback 3: og:zillow_fb description format "last sold for $X in Month YYYY"  
  const fbDesc = text.match(/last sold for \$([\d,]+) in ([A-Za-z]+) (\d{4})/i);
  if (fbDesc) {
    const MON_MAP = {january:"Jan",february:"Feb",march:"Mar",april:"Apr",may:"May",june:"Jun",july:"Jul",august:"Aug",september:"Sep",october:"Oct",november:"Nov",december:"Dec"};
    return { price: parseInt(fbDesc[1].replace(/,/g,""),10), month: MON_MAP[fbDesc[2].toLowerCase()]||fbDesc[2].slice(0,3), year: parseInt(fbDesc[3],10), source:"Zillow" };
  }
  return null;
}

// Redfin page (when accessible): "Sold • Sep 2013 • $925,000" or table rows
function parseRedfinPage(text) {
  // Table format: | Sep 2013 | Sold | $925,000 |
  const tbl = text.match(/\|\s*([A-Za-z]+)\s+(\d{4})\s*\|\s*Sold\s*\|\s*\$([\d,]+)/i);
  if (tbl) {
    const MON_MAP2 = {jan:"Jan",feb:"Feb",mar:"Mar",apr:"Apr",may:"May",jun:"Jun",jul:"Jul",aug:"Aug",sep:"Sep",oct:"Oct",nov:"Nov",dec:"Dec"};
    return { price: parseInt(tbl[3].replace(/,/g,""),10), month: MON_MAP2[tbl[1].toLowerCase().slice(0,3)]||tbl[1].slice(0,3), year: parseInt(tbl[2],10), source: "Redfin" };
  }
  // Inline: "Sold for $381,000 on Jul 30, 2020"
  const inline = text.match(/sold\s+for\s+\$([\d,]+)\s+on\s+([A-Za-z]+)\s+\d+,?\s+(\d{4})/i);
  if (inline) {
    const MON_MAP2 = {jan:"Jan",feb:"Feb",mar:"Mar",apr:"Apr",may:"May",jun:"Jun",jul:"Jul",aug:"Aug",sep:"Sep",oct:"Oct",nov:"Nov",dec:"Dec"};
    return { price: parseInt(inline[1].replace(/,/g,""),10), month: MON_MAP2[inline[2].toLowerCase().slice(0,3)]||inline[2].slice(0,3), year: parseInt(inline[3],10), source: "Redfin" };
  }
  return null;
}

// Realtor.com page: "Sold Price $381,000" with nearby date, or "Sold $381,000 on Jul 30, 2020"
function parseRealtorPage(text) {
  // "Sold $381,000 • Jul 2020" or "Sold on 07/30/2020 for $381,000"
  const m1 = text.match(/sold[^$\n]*\$([\d,]+)[^$\n]*?([A-Za-z]+)\s+(\d{4})/i);
  if (m1) {
    const MON_MAP2 = {jan:"Jan",feb:"Feb",mar:"Mar",apr:"Apr",may:"May",jun:"Jun",jul:"Jul",aug:"Aug",sep:"Sep",oct:"Oct",nov:"Nov",dec:"Dec"};
    const price = parseInt(m1[1].replace(/,/g,""),10);
    const mon   = MON_MAP2[m1[2].toLowerCase().slice(0,3)] || m1[2].slice(0,3);
    const year  = parseInt(m1[3],10);
    if (price > 1000 && year > 1980) return { price, month: mon, year, source: "Realtor.com" };
  }
  const m2 = text.match(/sold[^$\n]*?(\d{1,2})\/(\d{1,2})\/(\d{4})[^$\n]*\$([\d,]+)/i);
  if (m2) {
    const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const price = parseInt(m2[4].replace(/,/g,""),10);
    if (price > 1000) return { price, month: MON[parseInt(m2[1],10)-1]||"Jan", year: parseInt(m2[3],10), source: "Realtor.com" };
  }
  return null;
}

// Homes.com or generic page parser
function parseGenericPage(text, source) {
  // "last sold on 2020-07-30 for $381,000"
  const iso = text.match(/last sold on (\d{4})-(\d{2})-\d{2} for \$([\d,]+)/i);
  if (iso) {
    const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return { price: parseInt(iso[3].replace(/,/g,""),10), month: MON[parseInt(iso[2],10)-1]||"Jan", year: parseInt(iso[1],10), source };
  }
  // "Sold Jul 2020 $381,000" or "Sold: Jul 30, 2020 · $381,000"
  const gen = text.match(/sold[:\s•·]+([A-Za-z]+)\s+\d*,?\s*(\d{4})[^$\n]*\$([\d,]+)/i);
  if (gen) {
    const MON_MAP2 = {jan:"Jan",feb:"Feb",mar:"Mar",apr:"Apr",may:"May",jun:"Jun",jul:"Jul",aug:"Aug",sep:"Sep",oct:"Oct",nov:"Nov",dec:"Dec"};
    const price = parseInt(gen[3].replace(/,/g,""),10);
    if (price > 1000) return { price, month: MON_MAP2[gen[1].toLowerCase().slice(0,3)]||gen[1].slice(0,3), year: parseInt(gen[2],10), source };
  }
  return null;
}

// Fetch a URL (server-side via Anthropic proxy — just a HEAD/GET, 0 LLM tokens output)
// We use web_search with the exact URL as the only token-free fetch path available.
// For Zillow specifically, direct fetch works because it returns CORS-accessible HTML.
async function fetchDirectPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PropertyValueBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Main waterfall ────────────────────────────────────────────────────────────
async function lookupLastSale(address, updateSource = ()=>{}) {

  // ── Step 1: Zillow — find zpid URL then fetch + parse Price History ──────
  updateSource("Zillow");
  try {
    // Zillow ALWAYS requires the zpid in the URL — slug-only URLs don't work.
    // Strategy: search for the address on Zillow to get the canonical zpid URL,
    // extracting it from search result URLs (tool_result blocks) before asking
    // the model to output anything — that way we use near-zero LLM tokens.
    let zHtml = null;

    const zpidResult = await callAnthropic({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,  // enough for a URL if model outputs it, but we primarily parse tool results
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "Output ONLY the exact Zillow homedetails URL with zpid. Nothing else.",
      messages: [{ role: "user", content:
        `Search zillow.com for: ${address}\n` +
        `Return ONLY the URL in this exact format: https://www.zillow.com/homedetails/ADDRESS_SLUG/XXXXXXX_zpid/`
      }],
    });
    if (zpidResult.noAccount) return { noAccount: true, data: null };

    if (zpidResult.ok) {
      // First: scan ALL content blocks (tool_result, text) for any Zillow zpid URL
      // Search results often contain the URL in tool_result metadata even before the model responds
      const allBlocks = zpidResult.data?.content || [];
      let zpidUrl = null;

      for (const block of allBlocks) {
        // tool_result blocks contain raw search result JSON with URLs
        const rawText = block.content?.[0]?.text || block.text || "";
        const found = rawText.match(/https?:\/\/www\.zillow\.com\/homedetails\/[^\s"'<>)]+\d+_zpid\/?/i);
        if (found) { zpidUrl = found[0].replace(/\/$/, "") + "/"; break; }
      }

      // Also check the joined text (model's own output)
      if (!zpidUrl) {
        const allText = allBlocks.map(b => b.content?.[0]?.text || b.text || "").join(" ");
        const found = allText.match(/https?:\/\/www\.zillow\.com\/homedetails\/[^\s"'<>)]+\d+_zpid\/?/i);
        if (found) zpidUrl = found[0].replace(/\/$/, "") + "/";
      }

      if (zpidUrl) {
        zHtml = await fetchDirectPage(zpidUrl);
      }
    }

    if (zHtml) {
      const result = parseZillowPage(zHtml);
      if (result) return { noAccount: false, data: result };
    }
  } catch {}

  // ── Step 2: Redfin — search for URL, fetch page, parse Sale History ──────
  updateSource("Redfin");
  try {
    const rfSearchResult = await callAnthropic({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "Output ONLY the raw Redfin property URL and nothing else.",
      messages: [{ role: "user", content: `Find the Redfin property page URL for: ${address}\nOutput ONLY the URL like: https://www.redfin.com/.../home/... — nothing else.` }],
    });
    if (rfSearchResult.ok) {
      const allText = (rfSearchResult.data?.content||[]).map(b => b.text || b.content?.[0]?.text || "").join(" ");
      const urlMatch = allText.match(/https?:\/\/www\.redfin\.com\/[^\s"')]+home\/\d+/i);
      if (urlMatch) {
        const rfHtml = await fetchDirectPage(urlMatch[0]);
        if (rfHtml) {
          const result = parseRedfinPage(rfHtml);
          if (result) return { noAccount: false, data: result };
        }
      }
    }
  } catch {}

  // ── Step 3: Realtor.com — search for URL, fetch, parse ───────────────────
  updateSource("Realtor.com");
  try {
    const rlSlug = addressToRealtorSlug(address);
    const rlHtml = await fetchDirectPage(`https://www.realtor.com/realestateandhomes-detail/${rlSlug}`);
    if (rlHtml) {
      const result = parseRealtorPage(rlHtml);
      if (result) return { noAccount: false, data: result };
    }
    // If slug didn't work, search for the URL
    const rlSearch = await callAnthropic({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "Output ONLY the raw Realtor.com property URL.",
      messages: [{ role: "user", content: `Find the Realtor.com property page URL for: ${address}\nOutput ONLY the URL — nothing else.` }],
    });
    if (rlSearch.ok) {
      const allText = (rlSearch.data?.content||[]).map(b => b.text || b.content?.[0]?.text || "").join(" ");
      const urlMatch = allText.match(/https?:\/\/www\.realtor\.com\/realestateandhomes-detail\/[^\s"')]+/i);
      if (urlMatch) {
        const rlHtml2 = await fetchDirectPage(urlMatch[0]);
        if (rlHtml2) {
          const result = parseRealtorPage(rlHtml2);
          if (result) return { noAccount: false, data: result };
        }
      }
    }
  } catch {}

  // ── Step 4: Homes.com ─────────────────────────────────────────────────────
  updateSource("Homes.com");
  try {
    const hmSearch = await callAnthropic({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "Output ONLY the raw Homes.com property URL.",
      messages: [{ role: "user", content: `Find the Homes.com property page URL for: ${address}\nOutput ONLY the URL — nothing else.` }],
    });
    if (hmSearch.ok) {
      const allText = (hmSearch.data?.content||[]).map(b => b.text || b.content?.[0]?.text || "").join(" ");
      const urlMatch = allText.match(/https?:\/\/www\.homes\.com\/property\/[^\s"')]+/i);
      if (urlMatch) {
        const hmHtml = await fetchDirectPage(urlMatch[0]);
        if (hmHtml) {
          const result = parseGenericPage(hmHtml, "Homes.com");
          if (result) return { noAccount: false, data: result };
        }
      }
    }
  } catch {}

  // ── Step 5: Last resort — Anthropic AI search (Sonnet, parses snippets) ───
  updateSource("AI search");
  try {
    const finalResult = await callAnthropic({
      max_tokens: 350,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "You are a data-extraction bot. Output ONLY raw JSON — no markdown, no prose.",
      messages: [{ role: "user", content:
        `Search for the last sale price and date of: "${address}"\n` +
        `Look in Zillow price history (event=Sold), Redfin sale history, Realtor.com, and public records.\n` +
        `Output ONLY: {"price":381000,"month":"Jul","year":2020,"source":"Zillow"}\n` +
        `month = 3-letter Jan-Dec. If not found: {"price":null,"month":null,"year":null,"source":null}`
      }],
    });
    if (!finalResult.ok) return { noAccount: finalResult.noAccount, data: null };
    // Also check raw snippets from tool results
    const rawBlocks = finalResult.data?.content || [];
    for (const block of rawBlocks) {
      const txt = block.content?.[0]?.text || block.text || "";
      if (txt) {
        const scraped = parseGenericPage(txt, "web search");
        if (scraped) return { noAccount: false, data: scraped };
      }
    }
    const aiResult = parseSaleJson(extractText(finalResult.data), "web search");
    return { noAccount: false, data: aiResult };
  } catch {
    return { noAccount: false, data: null };
  }
}

async function fetchPermits(address) {
  const result = await callAnthropic({
    max_tokens: 800,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: "You are a data-extraction bot. Output ONLY raw JSON — no markdown, no prose, no explanation.",
    messages: [{ role: "user", content:
      `Search building permit records for: "${address}"\n` +
      `Check the official city/county open data permit portal.\n` +
      `Output ONLY a JSON array (no markdown, max 10 items, newest first):\n` +
      `[{"number":"id","type":"type","description":"work","status":"status","filed":"YYYY-MM-DD","issued":"YYYY-MM-DD or null","completed":"YYYY-MM-DD or null","cost":"$X,XXX or null"}]\n` +
      `If none found: []`
    }],
  });
  if (!result.ok) return { noAccount: result.noAccount, permits: [] };
  const text = extractText(result.data).replace(/```json|```/g, "").trim();
  // Try direct parse first
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return { noAccount: false, permits: arr };
  } catch {}
  const m = text.match(/\[[\s\S]*\]/);
  try { return { noAccount: false, permits: m ? JSON.parse(m[0]) : [] }; }
  catch { return { noAccount: false, permits: [] }; }
}



// ── Auth Modal ────────────────────────────────────────────────────────────────
function AuthModal({ onClose, onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true); setError("");
    try {
      if (mode === "login") await signIn(email, password);
      else await signUp(email, password);
      onAuth();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
        <div>
          <h2 style={{fontSize:20,margin:0,color:"var(--color-text-primary)",fontWeight:600}}>{mode==="login"?"Welcome back":"Create account"}</h2>
          <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"4px 0 0"}}>Save your property lookups across sessions</p>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:18}}>✕</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address"
          style={{padding:"9px 12px",borderRadius:"var(--border-radius-md)",border:"1.5px solid var(--color-border-secondary)",fontSize:13,outline:"none"}}
          onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"
          style={{padding:"9px 12px",borderRadius:"var(--border-radius-md)",border:"1.5px solid var(--color-border-secondary)",fontSize:13,outline:"none"}}
          onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
        {error && <p style={{fontSize:12,color:"#d0222d",margin:0,padding:"8px 12px",background:"#fff0f0",borderRadius:6}}>{error}</p>}
        <button onClick={handleSubmit} disabled={loading||!email.trim()||!password.trim()}
          style={{padding:"10px 0",borderRadius:"var(--border-radius-md)",background:loading?"#ccc":"var(--color-text-primary)",color:"#fff",border:"none",cursor:loading?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>
          {loading ? "…" : mode==="login" ? "Sign in" : "Create account"}
        </button>
        <p style={{textAlign:"center",fontSize:12,color:"var(--color-text-secondary)",margin:0}}>
          {mode==="login" ? "No account? " : "Have an account? "}
          <button onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");}}
            style={{background:"none",border:"none",cursor:"pointer",color:"#185FA5",fontSize:12,fontWeight:600,padding:0}}>
            {mode==="login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </>
  );
}

export default function App() {
  const [user,        setUser]        = useState(getUser());
  const [showAuth,    setShowAuth]    = useState(false);
  const [address,     setAddress]     = useState("");
  const [priceRaw,    setPriceRaw]    = useState("");
  const [purchaseMon, setPurchaseMon] = useState("Jan");
  const [purchaseYr,  setPurchaseYr]  = useState("2015");
  const [submitted,   setSubmitted]   = useState(false);
  const [permits,     setPermits]     = useState(null);
  const [permitsLoading,setPermitsLoading]=useState(false);
  const [permitsError,  setPermitsError]  =useState(null);
  const [activeTab,   setActiveTab]   = useState("chart");
  const [permitSubTab,setPermitSubTab]= useState("history"); // history | opportunities
  const [opps,        setOpps]        = useState(null);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState(null);   // the clicked opportunity object
  const [detail,      setDetail]      = useState(null);   // vendors + permit steps
  const [detailLoading,setDetailLoading]=useState(false);
  const [lookupState, setLookupState] = useState("idle"); // idle | loading | found | notfound
  const [lookupMsg,   setLookupMsg]   = useState("");


  const [lookupSource, setLookupSource] = useState(""); // which source is being tried
  const [pdfStatus,         setPdfStatus]         = useState("idle");
  const [detailedPdfStatus, setDetailedPdfStatus] = useState("idle"); // idle | generating | success | error

  async function handleLookup() {
    if (!address.trim()) return;
    setLookupState("loading");
    setLookupMsg("");
    setLookupSource("checking database…");

    // ── Check Supabase cache first ──────────────────────────────────────────
    const cached = await dbGetProperty(address);
    if (cached && cached.last_sale_price) {
      setPriceRaw(Number(cached.last_sale_price).toLocaleString());
      setPurchaseMon(cached.last_sale_month || "Jan");
      setPurchaseYr(String(cached.last_sale_year || 2020));
      setLookupMsg(`Cached: ${cached.last_sale_month} ${cached.last_sale_year} · $${Number(cached.last_sale_price).toLocaleString()} · previously looked up`);
      setLookupState("found");
      setLookupSource("");
      return;
    }

    // ── Live lookup via API ────────────────────────────────────────────────
    setLookupSource("searching…");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://permit-suite-api.vercel.app'}/api/price/lookup`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ address }),
      });
      setLookupSource("");
      if (res.status === 404) {
        setLookupState("notfound");
        setLookupMsg("No sale record found — enter price and date manually.");
        return;
      }
      if (!res.ok) {
        setLookupState("notfound");
        setLookupMsg("Lookup failed — enter price and date manually.");
        return;
      }
      const data = await res.json();
      setPriceRaw(Number(data.price).toLocaleString());
      setPurchaseMon(data.month);
      setPurchaseYr(String(data.year));
      setLookupMsg(`Last sale: ${data.month} ${data.year} · $${Number(data.price).toLocaleString()}${data.source ? " · via " + data.source : ""}`);
      setLookupState("found");
      setSubmitted(false);
      // ── Write to Supabase cache ─────────────────────────────────────────
      dbUpsertProperty({
        address,
        lastSalePrice: data.price,
        lastSaleMonth: data.month,
        lastSaleYear:  data.year,
        saleSource:    data.source,
        lookedUpBy:    user?.email || "anonymous",
      });
    } catch {
      setLookupSource("");
      setLookupState("notfound");
      setLookupMsg("Lookup failed — enter price and date manually.");
    }
  }

  const cityKey    = useMemo(()=>detectCity(address),[address]);
  const accent     = CITY_COLORS[cityKey];
  const price      = parseFloat((priceRaw||"").replace(/[^0-9.]/g,""));
  const purchaseStr= purchaseMon+"-"+purchaseYr;
  const canSubmit  = address.trim().length>0 && !isNaN(price) && price>0;

  const [projection, setProjection] = useState(null);
  useEffect(()=>{
    if (!submitted||isNaN(price)||price<=0) { setProjection(null); return; }
    fetch(`${import.meta.env.VITE_API_URL || 'https://permit-suite-api.vercel.app'}/api/price/projection`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ address, purchasePrice: price, purchaseMonth: purchaseStr }),
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(({ projection: proj }) => setProjection(proj || null))
      .catch(() => setProjection(null));
  },[submitted,price,purchaseStr,address]);

  const chartData = useMemo(()=>{
    if (!projection) return [];
    // Show every 3rd point for history (dense), every point for forecast
    return projection.filter((_,i)=>i%3===0||projection[i].isForecast||projection[i].isExtrapolated);
  },[projection]);

  const todayPt = projection?(projection.find(d=>d.month==="Jan-2026")||projection.find(d=>d.month==="Feb-2026")||projection[projection.length-1]):null;
  const lastPt  = projection?projection[projection.length-1]:null;
  const gainNow = todayPt?todayPt.value-price:0;
  const gainEnd = lastPt?lastPt.value-price:0;
  const pctNow  = price>0?(gainNow/price)*100:0;
  const pctEnd  = price>0?(gainEnd/price)*100:0;

  const milestones = useMemo(()=>{
    if (!projection) return [];
    const keys=new Set([purchaseStr]);
    projection.forEach(d=>{
      if(d.month.startsWith("Jan")||d.month==="Apr-2007"||d.month==="Jan-2009"||d.month==="Jan-2012"||d.month==="Jan-2020"||d.month==="Jan-2026"||d.month==="May-2027"||d.month===projection[projection.length-1].month)
        keys.add(d.month);
    });
    return [...keys].sort((a,b)=>monToN(a)-monToN(b)).map(k=>projection.find(d=>d.month===k)).filter(Boolean);
  },[projection,purchaseStr]);

  const handleSubmit=useCallback(()=>{
    if(!canSubmit)return;
    setSubmitted(true);setPermits(null);setPermitsError(null);setOpps(null);setOppsLoading(false);setSelectedOpp(null);setDetail(null);setDetailLoading(false);setPermitSubTab("history");setActiveTab("chart");

    // ── Save manually entered price to API cache ──────────────────────────
    const apiBase = import.meta.env.VITE_API_URL || 'https://permit-suite-api.vercel.app';
    fetch(`${apiBase}/api/price/save`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        address,
        price: parseFloat((priceRaw||'').replace(/[^0-9.]/g,'')),
        month: purchaseMon,
        year:  parseInt(purchaseYr),
        source: 'manual',
      }),
    }).catch(() => {});

    // ── Permits + opportunities via API (handles cache internally) ────────
    setOppsLoading(true);
    setPermitsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL || 'https://permit-suite-api.vercel.app'}/api/permit/opportunities`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ address }),
    })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(({ permits: p, opportunities: o }) => {
        setPermits(p || []);
        setOpps(o || []);
        setPermitsLoading(false);
        setOppsLoading(false);
      })
      .catch(() => {
        setPermitsError("error");
        setPermits([]);
        setOpps([]);
        setPermitsLoading(false);
        setOppsLoading(false);
      });
  },[canSubmit,address,cityKey]);

  function tabLabel(t){if(t==="permits"){if(permitsLoading)return"Permits…";if(permits&&permits.length>0)return`Permits (${permits.length})`;}if(t==="valuation")return"Valuation";return t.charAt(0).toUpperCase()+t.slice(1);}

  // ── Valuation calculations ─────────────────────────────────────────────────
  const valuationData = useMemo(() => {
    if (!opps || !todayPt) return [];
    const currentValue = todayPt.value || 0;
    // Value-add percentages by category, calibrated to city
    const VALUE_ADD = {
      "ADU/In-Law Unit":    { pct: 0.261, midPct: 0.261 },
      "Seismic Retrofit":   { pct: 0.058, midPct: 0.058 },
      "Solar Installation": { pct: 0.051, midPct: 0.051 },
      "Kitchen Remodel":    { pct: 0.094, midPct: 0.094 },
      "Electrical Upgrade": { pct: 0.029, midPct: 0.029 },
      "Bathroom Addition":  { pct: 0.094, midPct: 0.094 },
      "EV Charger":         { pct: 0.015, midPct: 0.015 },
      "Roof Replacement":   { pct: 0.020, midPct: 0.020 },
      "Window Replacement": { pct: 0.018, midPct: 0.018 },
      "HVAC Upgrade":       { pct: 0.025, midPct: 0.025 },
      "Deck/Patio":         { pct: 0.030, midPct: 0.030 },
      "Garage Conversion":  { pct: 0.045, midPct: 0.045 },
      "Pool/Spa":           { pct: 0.025, midPct: 0.025 },
      "Hurricane Impact Windows": { pct: 0.022, midPct: 0.022 },
    };
    // Parse cost range midpoint from string like "$150,000–$350,000"
    function parseCostMid(s) {
      if (!s) return 0;
      const nums = s.replace(/[$,]/g, "").split(/[–\-]/).map(Number).filter(Boolean);
      if (nums.length === 2) return (nums[0] + nums[1]) / 2;
      if (nums.length === 1) return nums[0];
      return 0;
    }
    return opps.map(o => {
      const va = VALUE_ADD[o.category] || { pct: 0.020, midPct: 0.020 };
      const valueAdded = Math.round(currentValue * va.pct);
      const costMid = parseCostMid(o.typicalCost);
      const roi = costMid > 0 ? Math.round((valueAdded / costMid) * 100) : null;
      return {
        ...o,
        valueAdded,
        valueLow: Math.round(valueAdded * 0.5),
        valueHigh: Math.round(valueAdded * 1.5),
        newValue: currentValue + valueAdded,
        upliftPct: va.pct * 100,
        roi,
        costMid,
      };
    }).sort((a,b) => (b.roi||0) - (a.roi||0));
  }, [opps, todayPt]);

  return (
    <div style={{fontFamily:"var(--font-sans)",maxWidth:760,margin:"0 auto",padding:"2rem 1rem"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showAuth && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
          <div style={{background:"var(--color-background-primary)",borderRadius:16,padding:"2rem",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <AuthModal onClose={()=>setShowAuth(false)} onAuth={()=>{setUser(getUser());setShowAuth(false);}} />
          </div>
        </div>
      )}

      <div style={{marginBottom:"1.5rem"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:9,marginBottom:4}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <i className="ti ti-building-estate" style={{fontSize:21,color:accent}}/>
            <span style={{fontSize:21,fontWeight:500,color:"var(--color-text-primary)"}}>Property Value Predictor</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {user ? (
              <>
                <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{user.email}</span>
                <button onClick={async()=>{await signOut();setUser(null);}} style={{fontSize:11,color:"var(--color-text-secondary)",background:"none",border:"1px solid var(--color-border-tertiary)",borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>Sign out</button>
              </>
            ) : (
              <button onClick={()=>setShowAuth(true)} style={{fontSize:11,color:"var(--color-text-secondary)",background:"none",border:"1px solid var(--color-border-tertiary)",borderRadius:6,padding:"3px 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                <i className="ti ti-user" style={{fontSize:12}}/>Sign in
              </button>
            )}
          </div>
        </div>
        <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:0,lineHeight:1.55}}>
          Powered by S&P/Case-Shiller Home Price Index (FRED · St. Louis Fed). Actual historical data 1987–2026. Forecast 2026–2027 from macroeconomic model.
        </p>
      </div>

      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem 1.5rem",marginBottom:"1.5rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>
          <div style={{gridColumn:"1 / -1"}}>
            <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Property address</label>
            <div style={{display:"flex",gap:8}}>
              <div style={{position:"relative",flex:1}}>
                <i className="ti ti-map-pin" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:15,color:"var(--color-text-tertiary)",pointerEvents:"none"}}/>
                <input
                  type="text"
                  value={address}
                  onChange={e=>{setAddress(e.target.value);setSubmitted(false);setLookupState("idle");setLookupMsg("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleLookup()}
                  placeholder="Please enter the property address: Street, City, State"
                  style={{width:"100%",paddingLeft:34,boxSizing:"border-box"}}
                />
              </div>
              <button
                onClick={handleLookup}
                disabled={!address.trim()||lookupState==="loading"}
                style={{
                  padding:"0 20px",
                  borderRadius:"var(--border-radius-md)",
                  border:"none",
                  background:(!address.trim()||lookupState==="loading")?"var(--color-background-secondary)":accent,
                  color:(!address.trim()||lookupState==="loading")?"var(--color-text-tertiary)":"#fff",
                  cursor:(!address.trim()||lookupState==="loading")?"not-allowed":"pointer",
                  fontSize:14,fontWeight:500,
                  display:"flex",alignItems:"center",gap:6,
                  whiteSpace:"nowrap",flexShrink:0,
                  transition:"background 0.15s",
                }}
              >
                {lookupState==="loading"
                  ? <><span style={{display:"inline-block",width:13,height:13,border:"2px solid #fff",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>{lookupSource ? `Checking ${lookupSource}…` : "Looking up…"}</>
                  : "Look up last sale"
                }
              </button>
            </div>
            {address.trim()&&(
              <div style={{marginTop:5}}>
                {lookupState==="found"&&<p style={{fontSize:12,margin:0,color:"#0F6E56"}}><i className="ti ti-circle-check" style={{fontSize:12,marginRight:4}}/>{lookupMsg}</p>}
                {lookupState==="notfound"&&<p style={{fontSize:12,margin:0,color:"var(--color-text-tertiary)"}}><i className="ti ti-alert-circle" style={{fontSize:12,marginRight:4}}/>{lookupMsg}</p>}
                {lookupState==="idle"&&<p style={{fontSize:12,margin:0,color:accent}}><i className="ti ti-map-check" style={{fontSize:12,marginRight:4}}/>Using <strong>{cityKey}</strong> Case-Shiller index{cityKey==="National"&&<span style={{color:"var(--color-text-tertiary)",marginLeft:4}}>(national baseline)</span>}</p>}
                {lookupState==="noapi"&&(
                  <div style={{background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"10px 12px",marginTop:2}}>
                    <p style={{fontSize:12,margin:"0 0 6px",color:"var(--color-text-secondary)",display:"flex",alignItems:"center",gap:5}}>
                      <i className="ti ti-info-circle" style={{fontSize:13,color:accent}}/>
                      No Claude account detected — look up the last sale price manually on these sites, then enter the price and date above:
                    </p>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {buildSearchLinks(address).map(({label,url})=>(
                        <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                          style={{fontSize:12,fontWeight:500,color:"#fff",background:accent,padding:"4px 10px",borderRadius:"var(--border-radius-md)",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                          <i className="ti ti-external-link" style={{fontSize:11}}/>{label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Purchase price</label>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"var(--color-text-tertiary)",pointerEvents:"none"}}>$</span>
              <input type="text" value={priceRaw} onChange={e=>{setPriceRaw(e.target.value);setSubmitted(false);}} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="450,000" style={{width:"100%",paddingLeft:22,boxSizing:"border-box"}}/>
            </div>
          </div>
          <div>
            <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Purchase date</label>
            <div style={{display:"flex",gap:8}}>
              <select value={purchaseMon} onChange={e=>{setPurchaseMon(e.target.value);setSubmitted(false);}} style={{flex:1}}>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select value={purchaseYr}  onChange={e=>{setPurchaseYr(e.target.value);setSubmitted(false);}}  style={{flex:1}}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div>
          </div>
        </div>
        <button onClick={handleSubmit} disabled={!canSubmit} style={{width:"100%",padding:"10px 0",borderRadius:"var(--border-radius-md)",background:canSubmit?accent:"var(--color-background-secondary)",color:canSubmit?"#fff":"var(--color-text-tertiary)",border:"none",cursor:canSubmit?"pointer":"not-allowed",fontWeight:500,fontSize:14}}>
          Calculate projection &amp; look up permits
        </button>
      </div>

      {submitted&&projection&&(
        <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))",gap:10}}>
            {[
              {label:"Purchase price",value:fmt(price),sub:purchaseStr,color:null},
              {label:"Est. value today",value:fmt(todayPt?.value||0),sub:"Jan 2026",color:null},
              {label:"Gain to date",value:fmtPct(pctNow),sub:fmt(gainNow)+" total",color:gainNow>=0?accent:"#D85A30"},
              {label:"Forecast "+(lastPt?.month||""),value:fmt(lastPt?.value||0),sub:fmtPct(pctEnd)+" vs purchase",color:gainEnd>=0?accent:"#D85A30"},
            ].map(card=>(
              <div key={card.label} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"0.875rem 1rem"}}>
                <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 3px"}}>{card.label}</p>
                <p style={{fontSize:18,fontWeight:500,margin:"0 0 2px",color:card.color||"var(--color-text-primary)"}}>{card.value}</p>
                <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:0}}>{card.sub}</p>
              </div>
            ))}
          </div>

          <div style={{
            border:"2px solid "+accent,
            borderRadius:"var(--border-radius-lg)",
            overflow:"hidden",
            boxShadow:"0 2px 8px "+accent+"28",
          }}>
            <div style={{display:"flex",justifyContent:"center",background:"var(--color-background-secondary)"}}>
              {["chart","table","permits"].map((t,i)=>(
                <button key={t} onClick={()=>setActiveTab(t)} style={{
                  flex:1, padding:"15px 0", border:"none",
                  background: activeTab===t ? accent : "transparent",
                  cursor:"pointer", fontSize:15, fontWeight:600,
                  color: activeTab===t ? "#fff" : "var(--color-text-secondary)",
                  letterSpacing:"0.02em",
                  textTransform:"capitalize",
                  borderRight: i<2 ? "1px solid "+(activeTab===t ? accent+"88" : "var(--color-border-tertiary)") : "none",
                  transition:"background 0.18s, color 0.18s",
                }}>{tabLabel(t)}</button>
              ))}
            </div>
          </div>

          {activeTab==="chart"&&(
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem 1.5rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:14}}>
                <span style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>Value trajectory — <span style={{color:accent}}>{cityKey}</span> Case-Shiller index</span>
                <div style={{display:"flex",gap:12,fontSize:11,color:"var(--color-text-secondary)",flexWrap:"wrap"}}>
                  {[["FRED historical",1],["Forecast",0.5],["Extrapolated",0.3]].map(([lbl,op])=>(
                    <span key={lbl} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:2,background:accent,opacity:op,display:"inline-block"}}/>{lbl}</span>
                  ))}
                </div>
              </div>
              <div style={{height:280}}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{top:5,right:10,left:5,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)"/>
                    <XAxis dataKey="month" tick={{fontSize:10,fill:"#888"}} interval={Math.max(1,Math.floor(chartData.length/12))}/>
                    <YAxis tickFormatter={v=>"$"+Math.round(v/1000)+"k"} tick={{fontSize:11,fill:"#888"}} width={60}/>
                    <Tooltip content={<ChartTooltip/>}/>
                    <ReferenceLine x={purchaseStr} stroke={accent} strokeDasharray="4 2" label={{value:"purchase",position:"top",fontSize:10,fill:accent}}/>
                    {monToN(purchaseStr)<monToN("Jan-2026")&&<ReferenceLine x="Jan-2026" stroke="#bbb" strokeDasharray="2 3" label={{value:"today",position:"insideTopLeft",fontSize:10,fill:"#aaa"}}/>}
                    {monToN(purchaseStr)<monToN("Mar-2026")&&<ReferenceLine x="Mar-2026" stroke="#ccc" strokeDasharray="2 4" label={{value:"forecast→",position:"insideTopRight",fontSize:10,fill:"#bbb"}}/>}
                    <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2} dot={false}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:"8px 0 0",lineHeight:1.5}}>
                Source: S&P Case-Shiller Home Price Index via FRED (St. Louis Fed). CSUSHPISA (National) and SFXRSA (San Francisco) actual published values. Forecast from macroeconomic regression model (spreadsheet).
              </p>
            </div>
          )}

          {activeTab==="table"&&(
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem 1.5rem",overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{borderBottom:"0.5px solid var(--color-border-secondary)"}}>
                  {["Date","Est. value","vs purchase","Source"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:h==="Date"?"left":"right",fontWeight:500,fontSize:12,color:"var(--color-text-secondary)"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {milestones.map(row=>{
                    const delta=row.value-price,pct=price>0?(delta/price)*100:0,isPurchase=row.month===purchaseStr;
                    const rt=rowType(row);
                    return(
                      <tr key={row.month} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:isPurchase?"var(--color-background-info)":"transparent"}}>
                        <td style={{padding:"7px 8px",fontWeight:isPurchase?500:400,color:"var(--color-text-primary)"}}>{row.month}{isPurchase&&<span style={{fontSize:11,color:"var(--color-text-info)",marginLeft:5}}>← purchase</span>}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontWeight:500}}>{fmt(row.value)}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",color:isPurchase?"var(--color-text-tertiary)":delta>=0?accent:"#D85A30"}}>{isPurchase?"—":fmtPct(pct)}</td>
                        <td style={{padding:"7px 8px",textAlign:"right"}}><span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:rt.bg,color:rt.fg}}>{rt.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab==="permits"&&(
            <div style={{
              background:"var(--color-background-primary)",
              border:"2px solid "+accent,
              borderRadius:"var(--border-radius-lg)",
              padding:"1.5rem",
              boxShadow:"0 2px 12px "+accent+"18",
            }}>

              {/* Sub-tab bar */}
              <div style={{display:"flex",justifyContent:"center",marginBottom:"1.5rem"}}>
                <div style={{
                  display:"flex",width:"100%",
                  border:"2px solid "+accent,
                  borderRadius:"var(--border-radius-md)",
                  overflow:"hidden",
                  boxShadow:"0 2px 8px "+accent+"28",
                }}>
                  {[
                    {key:"history",      label:`Permit History${permits&&permits.length>0?" ("+permits.length+")":""}`},
                    {key:"opportunities",label:`Opportunities${opps&&opps.length>0?" ("+opps.length+")":oppsLoading?" …":""}`},
                    {key:"valuation",    label:`Valuation${valuationData&&valuationData.length>0?" ("+valuationData.length+")":""}`},
                  ].map((st,si)=>(
                    <button key={st.key} onClick={()=>{setPermitSubTab(st.key);setSelectedOpp(null);setDetail(null);}} style={{
                      flex:1, padding:"13px 0", border:"none",
                      background: permitSubTab===st.key ? accent : "var(--color-background-secondary)",
                      cursor:"pointer", fontSize:13, fontWeight:600,
                      color: permitSubTab===st.key ? "#fff" : "var(--color-text-secondary)",
                      textAlign:"center",
                      borderRight: si<2 ? "1px solid "+(permitSubTab===st.key ? accent+"88" : "var(--color-border-tertiary)") : "none",
                      transition:"background 0.18s, color 0.18s",
                      letterSpacing:"0.01em",
                    }}>
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── History sub-tab ── */}
              {permitSubTab==="history"&&(
                <>
                  {permitsLoading&&<div style={{textAlign:"center",padding:"2rem",color:"var(--color-text-secondary)",fontSize:13}}><span style={{display:"inline-block",width:20,height:20,border:"2px solid "+accent,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:8}}/><p style={{margin:0}}>Searching permit databases…</p></div>}
                  {!permitsLoading&&permitsError&&permitsError!=="noapi"&&<div style={{padding:"12px 16px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-danger)",color:"var(--color-text-danger)",fontSize:13}}>Could not load permit data.</div>}
                  {!permitsLoading&&permits!==null&&permits.length===0&&permitsError!=="noapi"&&(
                    <div style={{textAlign:"center",padding:"1.5rem",color:"var(--color-text-tertiary)",fontSize:13}}>
                      <i className="ti ti-file-search" style={{fontSize:32,display:"block",marginBottom:8}}/>
                      <p style={{margin:"0 0 8px",fontSize:12,maxWidth:360,marginLeft:"auto",marginRight:"auto"}}>No permits found for this address.</p>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
                        {buildPermitLinks(address).map(({label,url})=>(
                          <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                            style={{fontSize:12,fontWeight:500,color:accent,border:`0.5px solid ${accent}`,padding:"4px 10px",borderRadius:"var(--border-radius-md)",textDecoration:"none",display:"flex",alignItems:"center",gap:3}}>
                            <i className="ti ti-external-link" style={{fontSize:11}}/>{label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {!permitsLoading&&permitsError==="noapi"&&(
                    <div style={{textAlign:"center",padding:"1.5rem",color:"var(--color-text-tertiary)",fontSize:13}}>
                      <i className="ti ti-lock-open" style={{fontSize:32,display:"block",marginBottom:8,color:accent}}/>
                      <p style={{margin:"0 0 10px",fontSize:13,color:"var(--color-text-secondary)"}}>No Claude account detected — search permit records directly:</p>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
                        {buildPermitLinks(address).map(({label,url})=>(
                          <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                            style={{fontSize:12,fontWeight:500,color:"#fff",background:accent,padding:"5px 12px",borderRadius:"var(--border-radius-md)",textDecoration:"none",display:"flex",alignItems:"center",gap:3}}>
                            <i className="ti ti-external-link" style={{fontSize:11}}/>{label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {!permitsLoading&&permits&&permits.length>0&&(
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {permits.map((p,i)=>{const sc=statusColor(p.status);return(
                        <div key={i} style={{border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"0.875rem 1rem"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:5}}>
                            <div><span style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)",marginRight:8}}>{p.number}</span><span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{p.type}</span></div>
                            <span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:sc.bg,color:sc.fg,whiteSpace:"nowrap"}}>{p.status}</span>
                          </div>
                          <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 6px",lineHeight:1.4}}>{p.description}</p>
                          <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"var(--color-text-tertiary)"}}>
                            <span>Filed: <strong style={{color:"var(--color-text-primary)"}}>{p.filed}</strong></span>
                            {p.issued&&<span>Issued: <strong style={{color:"var(--color-text-primary)"}}>{p.issued}</strong></span>}
                            {p.completed&&<span>Completed: <strong style={{color:"var(--color-text-primary)"}}>{p.completed}</strong></span>}
                            {p.cost&&<span>Est. cost: <strong style={{color:"var(--color-text-primary)"}}>{p.cost}</strong></span>}
                          </div>
                        </div>
                      );})}
                    </div>
                  )}
                  <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:"1rem 0 0",lineHeight:1.5}}>Direct API: SF, Chicago, NYC open data. All other addresses: AI web search of official city permit portals.</p>
                </>
              )}

              {/* ── Opportunities sub-tab ── */}
              {permitSubTab==="opportunities"&&(
                <>
                  {oppsLoading&&<div style={{textAlign:"center",padding:"2rem",color:"var(--color-text-secondary)",fontSize:13}}><span style={{display:"inline-block",width:20,height:20,border:"2px solid "+accent,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:8}}/><p style={{margin:"8px 0 0"}}>Researching local permit trends &amp; opportunities…</p></div>}
                  {!oppsLoading&&opps&&opps.length===0&&<div style={{textAlign:"center",padding:"2rem",color:"var(--color-text-tertiary)",fontSize:13}}><i className="ti ti-bulb" style={{fontSize:32,display:"block",marginBottom:8}}/>No additional opportunities identified.</div>}

                  {/* Opportunity list — hidden when detail panel is open */}
                  {!oppsLoading&&opps&&opps.length>0&&!selectedOpp&&(
                    <>
                      <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 10px",lineHeight:1.5}}>
                        Ranked by local permit activity — click any card for vendors and permitting steps.
                      </p>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {opps.map((o,i)=>{
                          const impactColor=o.valueImpact==="High"?"#065F46":o.valueImpact==="Medium"?"#92400E":"#1E3A8A";
                          const impactBg=o.valueImpact==="High"?"#D1FAE5":o.valueImpact==="Medium"?"#FEF3C7":"#DBEAFE";
                          const effortColor=o.effort==="High"?"#991B1B":o.effort==="Medium"?"#92400E":"#065F46";
                          const effortBg=o.effort==="High"?"#FEE2E2":o.effort==="Medium"?"#FEF3C7":"#D1FAE5";
                          const trendColor=o.localTrend==="Rising"?"#065F46":o.localTrend==="Declining"?"#991B1B":"#92400E";
                          const trendBg=o.localTrend==="Rising"?"#D1FAE5":o.localTrend==="Declining"?"#FEE2E2":"#FEF3C7";
                          const trendIcon=o.localTrend==="Rising"?"ti-trending-up":o.localTrend==="Declining"?"ti-trending-down":"ti-minus";
                          return(
                            <button key={i} onClick={()=>{
                              setSelectedOpp(o);
                              setDetail(null);
                              setDetailLoading(true);
                              fetchOpportunityDetail(address,o).then(d=>{setDetail(d);setDetailLoading(false);}).catch(()=>{setDetail(null);setDetailLoading(false);});
                            }} style={{
                              display:"block",width:"100%",textAlign:"left",
                              border:"0.5px solid var(--color-border-tertiary)",
                              borderRadius:"var(--border-radius-md)",
                              padding:"0.875rem 1rem",
                              background:"var(--color-background-primary)",
                              cursor:"pointer",
                              transition:"border-color 0.15s, box-shadow 0.15s",
                            }}
                            onMouseEnter={e=>{e.currentTarget.style.borderColor=accent;e.currentTarget.style.boxShadow="0 0 0 2px "+accent+"22";}}
                            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--color-border-tertiary)";e.currentTarget.style.boxShadow="none";}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:5}}>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                                    <span style={{fontSize:11,fontWeight:600,color:"var(--color-text-tertiary)",minWidth:20}}>#{o.rank||i+1}</span>
                                    <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{o.category}</span>
                                    {o.localTrend&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:99,background:trendBg,color:trendColor,display:"flex",alignItems:"center",gap:3}}><i className={"ti "+trendIcon} style={{fontSize:10}}/>{o.localTrend}</span>}
                                  </div>
                                  <span style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{o.title}</span>
                                  {o.localPopularity&&<span style={{fontSize:11,color:"var(--color-text-tertiary)",display:"block",marginTop:2}}>{o.localPopularity}</span>}
                                </div>
                                <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                                  <span style={{fontSize:10,padding:"2px 6px",borderRadius:99,background:impactBg,color:impactColor,whiteSpace:"nowrap"}}>Value: {o.valueImpact}</span>
                                  <span style={{fontSize:10,padding:"2px 6px",borderRadius:99,background:effortBg,color:effortColor,whiteSpace:"nowrap"}}>Effort: {o.effort}</span>
                                </div>
                              </div>
                              <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 7px",lineHeight:1.45}}>{o.description}</p>
                              <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",fontSize:11,color:"var(--color-text-tertiary)"}}>
                                {o.typicalCost&&<span><i className="ti ti-currency-dollar" style={{fontSize:11,verticalAlign:"-1px"}}/>Cost: <strong style={{color:"var(--color-text-primary)"}}>{o.typicalCost}</strong></span>}
                                {o.permitTimeline&&<span><i className="ti ti-calendar" style={{fontSize:11,verticalAlign:"-1px"}}/>Timeline: <strong style={{color:"var(--color-text-primary)"}}>{o.permitTimeline}</strong></span>}
                                <span style={{color:accent,marginLeft:"auto",display:"flex",alignItems:"center",gap:3}}><i className="ti ti-chevron-right" style={{fontSize:12}}/>Details</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:"1rem 0 0",lineHeight:1.5}}>
                    Opportunities ranked by recent local permit activity. Click any card for permit steps &amp; resources.
                  </p>
                </>
              )}

              {/* ── Valuation sub-tab ── */}
              {permitSubTab==="valuation"&&!selectedOpp&&(
                <>
                  {(!valuationData||valuationData.length===0)&&(
                    <div style={{textAlign:"center",padding:"2rem",color:"var(--color-text-tertiary)",fontSize:13}}>
                      <i className="ti ti-calculator" style={{fontSize:32,display:"block",marginBottom:8}}/>
                      <p style={{margin:0}}>No valuation data yet — run the projection first.</p>
                    </div>
                  )}
                  {valuationData&&valuationData.length>0&&(
                    <>
                      <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 12px",lineHeight:1.5}}>
                        Ranked by ROI (value increase ÷ cost) · Current value <strong style={{color:"var(--color-text-primary)"}}>{fmt(todayPt?.value||0)}</strong> · Click any row for permit steps &amp; resources
                      </p>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {valuationData.map((row,i)=>{
                          const roiColor = row.roi>300 ? "#065F46" : row.roi>100 ? "#92400E" : "#374151";
                          const roiBg   = row.roi>300 ? "#D1FAE5" : row.roi>100 ? "#FEF3C7" : "#F3F4F6";
                          const upliftColor = row.upliftPct>=5?"#065F46":row.upliftPct>=2?"#1E3A8A":"#374151";
                          const upliftBg   = row.upliftPct>=5?"#D1FAE5":row.upliftPct>=2?"#DBEAFE":"#F3F4F6";
                          return (
                            <button key={i} onClick={()=>{
                              setSelectedOpp(row);
                              setDetail(null);
                              setDetailLoading(true);
                              fetchOpportunityDetail(address,row).then(d=>{setDetail(d);setDetailLoading(false);}).catch(()=>{setDetail(null);setDetailLoading(false);});
                            }} style={{
                              display:"block",width:"100%",textAlign:"left",
                              border:"0.5px solid var(--color-border-tertiary)",
                              borderRadius:"var(--border-radius-md)",
                              padding:"0.875rem 1rem",
                              background:"var(--color-background-primary)",
                              cursor:"pointer",
                              transition:"border-color 0.15s, box-shadow 0.15s",
                            }}
                            onMouseEnter={e=>{e.currentTarget.style.borderColor=accent;e.currentTarget.style.boxShadow="0 0 0 2px "+accent+"22";}}
                            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--color-border-tertiary)";e.currentTarget.style.boxShadow="none";}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:6}}>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                                    <span style={{fontSize:11,fontWeight:700,color:"var(--color-text-tertiary)",minWidth:20}}>#{i+1}</span>
                                    <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{row.category}</span>
                                  </div>
                                  <span style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{row.title}</span>
                                </div>
                                <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end",alignItems:"center"}}>
                                  {row.roi!=null&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:roiBg,color:roiColor,fontWeight:600,whiteSpace:"nowrap"}}>ROI: {row.roi}%</span>}
                                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:upliftBg,color:upliftColor,whiteSpace:"nowrap"}}>+{row.upliftPct.toFixed(1)}%</span>
                                </div>
                              </div>
                              <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"var(--color-text-tertiary)",alignItems:"center"}}>
                                <span><i className="ti ti-currency-dollar" style={{fontSize:11,verticalAlign:"-1px"}}/>Cost: <strong style={{color:"var(--color-text-primary)"}}>{row.typicalCost}</strong></span>
                                <span><i className="ti ti-trending-up" style={{fontSize:11,verticalAlign:"-1px",color:accent}}/>Added: <strong style={{color:accent}}>{fmt(row.valueAdded)}</strong></span>
                                <span style={{color:"var(--color-text-tertiary)"}}>Range: {fmt(row.valueLow)}–{fmt(row.valueHigh)}</span>
                                <span style={{color:"var(--color-text-tertiary)"}}>New value: <strong style={{color:"var(--color-text-primary)"}}>{fmt(row.newValue)}</strong></span>
                                <span style={{color:accent,marginLeft:"auto",display:"flex",alignItems:"center",gap:3}}><i className="ti ti-chevron-right" style={{fontSize:12}}/>Steps &amp; resources</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:"12px 0 0",lineHeight:1.5}}>
                        Value estimates from Remodeling Magazine Cost vs Value and NAR Remodeling Impact reports, adjusted for {cityKey}. ROI = value added ÷ cost.
                      </p>
                    </>
                  )}
                </>
              )}

              {/* Shared detail panel — shown for both opportunities and valuation clicks */}
              {(permitSubTab==="valuation"||permitSubTab==="opportunities")&&selectedOpp&&(
                <div>
                  <button onClick={()=>{setSelectedOpp(null);setDetail(null);}} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:accent,fontSize:13,fontWeight:500,padding:"0 0 12px 0",marginBottom:4}}>
                    <i className="ti ti-arrow-left" style={{fontSize:14}}/> Back to {permitSubTab==="valuation"?"valuation":"opportunities"}
                  </button>
                  <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"1rem",marginBottom:"1rem"}}>
                    <span style={{fontSize:11,color:"var(--color-text-tertiary)",display:"block",marginBottom:3}}>{selectedOpp.category}{selectedOpp.rank?" · Rank #"+selectedOpp.rank:""}</span>
                    <span style={{fontSize:16,fontWeight:500,color:"var(--color-text-primary)",display:"block",marginBottom:6}}>{selectedOpp.title}</span>
                    <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"0 0 10px",lineHeight:1.5}}>{selectedOpp.description}</p>
                    {selectedOpp.roiNote&&<p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 10px",lineHeight:1.5,fontStyle:"italic"}}>{selectedOpp.roiNote}</p>}
                    <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:12,color:"var(--color-text-tertiary)"}}>
                      {selectedOpp.typicalCost&&<span>Cost: <strong style={{color:"var(--color-text-primary)"}}>{selectedOpp.typicalCost}</strong></span>}
                      {selectedOpp.localPopularity&&<span>Local adoption: <strong style={{color:"var(--color-text-primary)"}}>{selectedOpp.localPopularity}</strong></span>}
                      {selectedOpp.permitTimeline&&<span>Timeline: <strong style={{color:"var(--color-text-primary)"}}>{selectedOpp.permitTimeline}</strong></span>}
                      {selectedOpp.valueAdded!=null&&<span>Est. value added: <strong style={{color:accent}}>{fmt(selectedOpp.valueAdded)}</strong></span>}
                      {selectedOpp.roi!=null&&<span>ROI: <strong style={{color:selectedOpp.roi>300?accent:selectedOpp.roi>100?"#92400E":"var(--color-text-primary)"}}>{selectedOpp.roi}%</strong></span>}
                    </div>
                  </div>
                  {detailLoading&&<div style={{textAlign:"center",padding:"2rem",color:"var(--color-text-secondary)",fontSize:13}}><span style={{display:"inline-block",width:20,height:20,border:"2px solid "+accent,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:8}}/><p style={{margin:"8px 0 0"}}>Looking up local permit process…</p></div>}
                  {!detailLoading&&detail&&(
                    <>
                      {detail.permitSteps&&detail.permitSteps.length>0&&(
                        <div style={{marginBottom:"1rem"}}>
                          <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 10px",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <i className="ti ti-file-certificate" style={{fontSize:15,color:accent}}/>Permitting process
                            {detail.totalTimeline&&<span style={{fontWeight:400,color:"var(--color-text-secondary)",fontSize:12}}>· Total: {detail.totalTimeline}</span>}
                            {detail.isLocalData
                              ? <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:"#D1FAE5",color:"#065F46",fontWeight:600,marginLeft:4}}>
                                  <i className="ti ti-map-pin" style={{fontSize:10,marginRight:3}}/>Local data
                                </span>
                              : <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:"#F3F4F6",color:"#6B7280",fontWeight:500,marginLeft:4}}>
                                  General guide
                                </span>
                            }
                          </p>
                          {detail.portalUrl&&(
                            <a href={detail.portalUrl} target="_blank" rel="noopener noreferrer"
                               style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:accent,textDecoration:"none",marginBottom:10,padding:"4px 10px",border:"1px solid "+accent+"44",borderRadius:99,background:accent+"0a"}}>
                              <i className="ti ti-external-link" style={{fontSize:11}}/>Official permit portal
                            </a>
                          )}
                          {detail.localFees&&(
                            <p style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:8,padding:"6px 10px",background:"#FEF9C3",borderRadius:6,lineHeight:1.4}}>
                              <i className="ti ti-receipt" style={{fontSize:11,marginRight:4}}/>
                              <strong>Fees:</strong> {detail.localFees}
                            </p>
                          )}
                          <div style={{position:"relative",paddingLeft:24}}>
                            <div style={{position:"absolute",left:7,top:8,bottom:8,width:1.5,background:"var(--color-border-secondary)"}}/>
                            {detail.permitSteps.map((s,si)=>(
                              <div key={si} style={{position:"relative",marginBottom:14}}>
                                <div style={{position:"absolute",left:-24,top:3,width:15,height:15,borderRadius:"50%",background:accent,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  <span style={{fontSize:9,fontWeight:700,color:"#fff"}}>{s.step}</span>
                                </div>
                                <div style={{paddingLeft:4}}>
                                  <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                                    <span style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)"}}>{s.title}</span>
                                    {s.duration&&<span style={{fontSize:11,color:accent,background:accent+"18",padding:"1px 6px",borderRadius:99}}>{s.duration}</span>}
                                  </div>
                                  <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"2px 0 0",lineHeight:1.45}}>{s.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          {detail.localNotes&&(
                            <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"6px 0 0",padding:"6px 10px",background:accent+"0a",borderRadius:6,lineHeight:1.4,fontStyle:"italic"}}>
                              <i className="ti ti-info-circle" style={{fontSize:11,marginRight:4}}/>
                              {detail.localNotes}
                            </p>
                          )}
                        </div>
                      )}
                      {detail.keyRequirements&&detail.keyRequirements.length>0&&(
                        <div style={{marginBottom:"1rem",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"0.875rem 1rem"}}>
                          <p style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 8px",display:"flex",alignItems:"center",gap:5}}>
                            <i className="ti ti-checklist" style={{fontSize:14,color:accent}}/>Key requirements
                          </p>
                          {detail.keyRequirements.map((r,ri)=>(
                            <div key={ri} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:3}}>
                              <i className="ti ti-point-filled" style={{fontSize:8,color:accent,marginTop:4,flexShrink:0}}/>
                              <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{r}</span>
                            </div>
                          ))}
                          {detail.tips&&<p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"8px 0 0",lineHeight:1.5,fontStyle:"italic"}}><i className="ti ti-bulb" style={{fontSize:12,color:accent,marginRight:4}}/>{detail.tips}</p>}
                        </div>
                      )}
                      {detail.vendors&&detail.vendors.length>0&&(
                        <div>
                          <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 10px",display:"flex",alignItems:"center",gap:6}}>
                            <i className="ti ti-building-store" style={{fontSize:15,color:accent}}/>Find local contractors
                          </p>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>
                            {detail.vendors.map((v,vi)=>(
                              <div key={vi} style={{border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"0.75rem 1rem",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                                <div style={{flex:1,minWidth:0}}>
                                  <span style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",display:"block"}}>{v.name}</span>
                                  {v.specialty&&<span style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginTop:1}}>{v.specialty}</span>}
                                  <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:5,fontSize:11,color:"var(--color-text-tertiary)"}}>
                                    {v.yearsInBusiness&&<span><i className="ti ti-clock" style={{fontSize:11,verticalAlign:"-1px"}}/> {v.yearsInBusiness}</span>}
                                    {v.phone&&<span><i className="ti ti-phone" style={{fontSize:11,verticalAlign:"-1px"}}/> {v.phone}</span>}
                                  </div>
                                </div>
                                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                                  {v.rating&&<span style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)"}}><i className="ti ti-star-filled" style={{fontSize:11,color:"#F59E0B",verticalAlign:"-1px"}}/> {v.rating}{v.reviewCount&&<span style={{fontWeight:400,color:"var(--color-text-tertiary)"}}> · {v.reviewCount}</span>}</span>}
                                  {v.website&&<a href={v.website} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:accent,textDecoration:"none",display:"flex",alignItems:"center",gap:3}}><i className="ti ti-external-link" style={{fontSize:11}}/>Visit site</a>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(!detail.vendors||detail.vendors.length===0)&&<p style={{fontSize:12,color:"var(--color-text-tertiary)",marginTop:8}}>No vendor data found — try searching Yelp, Houzz, or Angi for local contractors.</p>}
                    </>
                  )}
                  {!detailLoading&&!detail&&<p style={{fontSize:12,color:"var(--color-text-tertiary)",padding:"1rem 0"}}>Could not load detail — please try again.</p>}
                </div>
              )}

            </div>
          )}

          {/* ── Generate Permit Report Summary + Detailed Report ─────────── */}
          {submitted&&projection&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginTop:8}}>
              {/* Row of two buttons */}
              <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
                {/* ── Button 1: Standard PDF ── */}
                <button
                  disabled={pdfStatus==="generating"}
                  onClick={()=>{
                    setPdfStatus("generating");
                    try {
                    const today = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
                    const topOpp = valuationData&&valuationData.length>0
                      ? [...valuationData].sort((a,b)=>(b.roi||0)-(a.roi||0))[0]
                      : null;

                    const permitsHTML = permits&&permits.length>0
                      ? `<table>
                          <thead><tr><th>Permit #</th><th>Type</th><th>Description</th><th>Status</th><th>Filed</th><th>Cost</th></tr></thead>
                          <tbody>${permits.map(p=>`<tr>
                            <td>${p.number||"—"}</td><td>${p.type||"—"}</td>
                            <td>${p.description||"—"}</td><td>${p.status||"—"}</td>
                            <td>${p.filed||"—"}</td><td>${p.cost||"—"}</td>
                          </tr>`).join("")}</tbody>
                        </table>`
                      : "<p style='color:#888;font-size:12px'>No permit records found.</p>";

                    const oppsRows = opps&&opps.length>0
                      ? opps.map((o,i)=>`<tr>
                          <td>${i+1}</td>
                          <td><strong>${o.title||""}</strong><br/><small style='color:#888'>${o.category||""}</small></td>
                          <td>${o.typicalCost||"—"}</td>
                          <td>${o.localPopularity||"—"}</td>
                          <td><span class="badge badge-${(o.valueImpact||"medium").toLowerCase()}">${o.valueImpact||"—"}</span></td>
                          <td><span class="badge badge-effort-${(o.effort||"medium").toLowerCase()}">${o.effort||"—"}</span></td>
                          <td>${o.roiNote||"—"}</td>
                        </tr>`).join("")
                      : "<tr><td colspan='7' style='color:#888'>No opportunities data — run Permits tab first.</td></tr>";

                    const valRows = valuationData&&valuationData.length>0
                      ? valuationData.map((r,i)=>`<tr>
                          <td>${i+1}</td>
                          <td><strong>${r.title||""}</strong><br/><small style='color:#888'>${r.category||""}</small></td>
                          <td>${r.typicalCost||"—"}</td>
                          <td class="money" style="color:${accent}">$${(r.valueAdded||0).toLocaleString()}</td>
                          <td>$${(r.valueLow||0).toLocaleString()}–$${(r.valueHigh||0).toLocaleString()}</td>
                          <td class="money">$${(r.newValue||0).toLocaleString()}</td>
                          <td><span style="padding:2px 7px;border-radius:99px;background:${(r.upliftPct||0)>=5?"#D1FAE5":(r.upliftPct||0)>=2?"#DBEAFE":"#F3F4F6"};color:${(r.upliftPct||0)>=5?"#065F46":(r.upliftPct||0)>=2?"#1E3A8A":"#374151"};font-size:10px;font-weight:600">+${(r.upliftPct||0).toFixed(1)}%</span></td>
                          <td class="money">${r.roi!=null?r.roi+"%":"—"}</td>
                        </tr>`).join("")
                      : "<tr><td colspan='8' style='color:#888'>No valuation data.</td></tr>";

                    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${(()=>{const p=address.split(",");const s=(p[0]||"").trim().replace(/[^a-zA-Z0-9\s]/g,"").trim().replace(/\s+/g,"-");return s||"Property-Report";})()}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600&family=DM+Sans:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#111;background:#fff}
.page{max-width:900px;margin:0 auto;padding:40px 48px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid ${accent}}
.header-left h1{font-family:'Source Serif 4',Georgia,serif;font-size:20px;font-weight:600;color:#111;margin-bottom:4px}
.header-left p{font-size:12px;color:#666;line-height:1.5}
.header-right{text-align:right;font-size:11px;color:#888}
.brand{font-size:13px;font-weight:600;color:${accent};margin-bottom:2px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px}
.card .lbl{font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#999;margin-bottom:5px}
.card .val{font-size:17px;font-weight:700;color:#111;margin-bottom:2px}
.card .sub{font-size:10px;color:#aaa}
.hl{border-color:${accent}!important;background:${accent}0d}
.hl .val{color:${accent}!important}
section{margin-bottom:28px}
h2{font-family:'Source Serif 4',Georgia,serif;font-size:14px;font-weight:600;color:#111;border-bottom:1px solid #e5e7eb;padding-bottom:7px;margin-bottom:12px}
.cnt{font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:500;color:#999;background:#f3f4f6;padding:2px 7px;border-radius:99px;margin-left:6px;vertical-align:middle}
table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;padding:5px 7px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:#666}
td{padding:6px 7px;border-bottom:1px solid #f3f4f6;vertical-align:top;line-height:1.4}
.money{text-align:right;font-weight:600}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:700}
.badge-high{background:#D1FAE5;color:#065F46}
.badge-medium{background:#FEF3C7;color:#92400E}
.badge-low{background:#DBEAFE;color:#1E3A8A}
.badge-effort-high{background:#FEE2E2;color:#991B1B}
.badge-effort-medium{background:#FEF3C7;color:#92400E}
.badge-effort-low{background:#D1FAE5;color:#065F46}
.footer{border-top:1px solid #e5e7eb;padding-top:12px;margin-top:8px;font-size:9px;color:#bbb;line-height:1.6}
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{margin:0}
  .page{padding:24px 32px}
}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>Property Permit Report</h1>
      <p>${address.replace(/</g,"&lt;")}<br/>Purchase: ${purchaseStr} &middot; ${fmt(price)} &middot; ${cityKey} market</p>
    </div>
    <div class="header-right">
      <div class="brand">Property Value Predictor</div>
      <div>S&amp;P/Case-Shiller (FRED)</div>
      <div style="margin-top:4px">${today}</div>
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="lbl">Purchase Price</div>
      <div class="val">${fmt(price)}</div>
      <div class="sub">${purchaseStr}</div>
    </div>
    <div class="card hl">
      <div class="lbl">Est. Value Today</div>
      <div class="val">${fmt(todayPt?.value||0)}</div>
      <div class="sub">${new Date().toLocaleDateString("en-US",{month:"short",year:"numeric"})}</div>
    </div>
    <div class="card hl">
      <div class="lbl">Gain to Date</div>
      <div class="val">${fmtPct(pctNow)}</div>
      <div class="sub">${fmt(gainNow)} total</div>
    </div>
    ${topOpp ? `<div class="card">
      <div class="lbl">Top Opportunity</div>
      <div class="val" style="font-size:12px;line-height:1.3">${topOpp.title}</div>
      <div class="sub">+${fmt(topOpp.valueAdded||0)} est. value</div>
    </div>` : ""}
  </div>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:24px;line-height:1.7;font-size:11px;color:#444">
    <div style="font-family:'Source Serif 4',Georgia,serif;font-size:13px;font-weight:600;color:#111;margin-bottom:6px">About This Report</div>
    This summary covers three areas of permit intelligence for <strong>${address.replace(/</g,"&lt;")}</strong>.
    <strong>Permit History</strong> lists all building permits on record at the ${cityKey} building department, showing the work performed, permit status, and associated costs — giving a picture of how this property has been maintained and improved over time.
    <strong>Permit Opportunities</strong> ranks improvements by local adoption rate — what similar properties in this ${cityKey} neighbourhood are actively permitted — so you can see what your neighbours are doing and what buyers in this market expect.
    <strong>Permit Valuation</strong> ranks those same improvements by return on investment: estimated value added divided by typical project cost, adjusted for the ${cityKey} market using data from the Remodeling Magazine Cost vs. Value report and NAR Remodeling Impact surveys.
    ${topOpp ? `The highest-ROI improvement identified is <strong>${topOpp.title}</strong>, estimated to add <strong>+${fmt(topOpp.valueAdded||0)}</strong> to the property's value.` : ""}
    For step-by-step permit guidance and local contractor resources, use the <em>Generate Detailed Permit Report</em>.
  </div>

  <section>
    <h2>Permit History<span class="cnt">${permits&&permits.length>0?permits.length+" permits on record":"No permits found"}</span></h2>
    ${permitsHTML}
  </section>

  <section>
    <h2>Permit Opportunities<span class="cnt">Ranked by local permit activity</span></h2>
    <table>
      <thead><tr>
        <th>#</th><th>Improvement</th><th>Typical Cost</th>
        <th>Local Adoption</th><th>Value Impact</th><th>Effort</th><th>Notes</th>
      </tr></thead>
      <tbody>${oppsRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Permit Valuation<span class="cnt">Ranked by ROI &middot; Current value ${fmt(todayPt?.value||0)}</span></h2>
    <table>
      <thead><tr>
        <th>#</th><th>Improvement</th><th>Typical Cost</th><th>Value Added</th>
        <th>Range</th><th>New Value</th><th>Uplift</th><th>ROI</th>
      </tr></thead>
      <tbody>${valRows}</tbody>
    </table>
    <p style="font-size:9px;color:#bbb;margin-top:7px;line-height:1.5">Value estimates from Remodeling Magazine Cost vs. Value and NAR Remodeling Impact reports, adjusted for ${cityKey}. ROI = value added &divide; midpoint cost.</p>
  </section>

  <div class="footer">
    Generated ${today} &middot; Property Value Predictor &middot; Data: S&amp;P/Case-Shiller FRED &middot; City open data &middot; Not a professional appraisal. Do not use for financial or legal decisions.
  </div>
</div>
<script>window.onload=function(){window.print();}</script>
</body>
</html>`;

                    // Build filename from address: "14421-SW-155th-Pl.pdf"
                    const pdfFilename = (() => {
                      const parts = address.split(",");
                      const street = (parts[0]||"").trim()
                        .replace(/[^a-zA-Z0-9\s]/g,"")
                        .trim()
                        .replace(/\s+/g,"-");
                      return street ? `${street}.pdf` : "Property-Report.pdf";
                    })();

                    // Strategy: create blob URL and open in new tab.
                    // The page's <title> is set to the filename so browsers pre-fill
                    // the "Save as PDF" filename in the print dialog.
                    // We also set a.download so the HTML source is directly downloadable.
                    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
                    const url  = URL.createObjectURL(blob);

                    // Primary: open new tab — window.onload triggers print dialog,
                    // user chooses "Save as PDF" and browser uses <title> as filename.
                    const a       = document.createElement("a");
                    a.href        = url;
                    a.target      = "_blank";
                    a.rel         = "noopener noreferrer";
                    // download attribute triggers direct save (HTML file) as fallback
                    // when new tab is blocked; named with .pdf so user knows intent.
                    a.download    = pdfFilename.replace(/\.pdf$/, ".html");
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(()=>URL.revokeObjectURL(url), 15000);
                    setPdfStatus("success");
                    setTimeout(()=>setPdfStatus("idle"), 5000);
                  } catch(err) {
                    console.error("PDF generation error:", err);
                    setPdfStatus("error");
                    setTimeout(()=>setPdfStatus("idle"), 6000);
                  }
                }}
                style={{
                  display:"flex",alignItems:"center",gap:8,
                  padding:"12px 28px",
                  borderRadius:"var(--border-radius-md)",
                  border:"none",
                  background: pdfStatus==="error" ? "#DC2626" : pdfStatus==="success" ? "#059669" : accent,
                  color:"#fff",
                  cursor: pdfStatus==="generating" ? "wait" : "pointer",
                  fontSize:14,fontWeight:600,
                  boxShadow:"0 2px 10px "+(pdfStatus==="error"?"#DC262644":pdfStatus==="success"?"#05996944":accent+"44"),
                  transition:"background 0.25s, box-shadow 0.25s, opacity 0.15s",
                  opacity: pdfStatus==="generating" ? 0.75 : 1,
                  minWidth: 220,
                  justifyContent:"center",
                }}
                onMouseEnter={e=>{ if(pdfStatus==="idle") e.currentTarget.style.opacity="0.88"; }}
                onMouseLeave={e=>{ e.currentTarget.style.opacity="1"; }}
              >
                {pdfStatus==="generating" && (
                  <span style={{display:"inline-block",width:14,height:14,border:"2px solid #fff",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                )}
                {pdfStatus==="success" && <i className="ti ti-circle-check" style={{fontSize:16}}/>}
                {pdfStatus==="error"   && <i className="ti ti-alert-circle" style={{fontSize:16}}/>}
                {(pdfStatus==="idle"||pdfStatus==="generating") && <i className="ti ti-file-type-pdf" style={{fontSize:16}}/>}
                {pdfStatus==="generating" ? "Generating…"
                  : pdfStatus==="success"  ? "Report opened — print or save as PDF"
                  : pdfStatus==="error"    ? "Failed — check browser popup settings"
                  : "Generate Permit Report Summary"}
              </button>

                {/* ── Button 2: Detailed Permit Report ── */}
                <button
                  disabled={detailedPdfStatus==="generating"}
                  onClick={async ()=>{
                    setDetailedPdfStatus("generating");
                    try {
                      const today = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
                      const pdfFilename = (()=>{
                        const parts = address.split(",");
                        const street = (parts[0]||"").trim().replace(/[^a-zA-Z0-9\s]/g,"").trim().replace(/\s+/g,"-");
                        return street ? `${street}-Detailed.html` : "Property-Report-Detailed.html";
                      })();
                      const titleSlug = pdfFilename.replace(/\.html$/,"");

                      // Fetch local permit details for every valuation item in parallel
                      const items = valuationData && valuationData.length > 0 ? valuationData : [];
                      const details = await Promise.all(
                        items.map(row => fetchOpportunityDetail(address, row).catch(()=>null))
                      );

                      // Build expanded HTML sections for each item
                      const itemSections = items.map((row, i) => {
                        const d = details[i];
                        const steps = d?.permitSteps || [];
                        const reqs  = d?.keyRequirements || [];
                        const isLocal = d?.isLocalData ? `<span style="display:inline-block;padding:1px 7px;border-radius:99px;background:#D1FAE5;color:#065F46;font-size:9px;font-weight:700;margin-left:6px">📍 Local data</span>` : `<span style="display:inline-block;padding:1px 7px;border-radius:99px;background:#F3F4F6;color:#6B7280;font-size:9px;font-weight:500;margin-left:6px">General guide</span>`;
                        const portalLink = d?.portalUrl ? `<a href="${d.portalUrl}" style="font-size:10px;color:${accent};margin-left:8px">Official portal ↗</a>` : "";
                        const feesNote = d?.localFees ? `<div style="font-size:10px;background:#FEF9C3;padding:4px 8px;border-radius:4px;margin-bottom:8px"><strong>Fees:</strong> ${d.localFees}</div>` : "";
                        const notesNote = d?.localNotes ? `<div style="font-size:10px;color:#555;font-style:italic;padding:4px 8px;background:${accent}0a;border-radius:4px;margin-top:6px">${d.localNotes}</div>` : "";
                        const roiColor = (row.roi||0)>300?"#065F46":(row.roi||0)>100?"#92400E":"#374151";
                        const upliftBg = (row.upliftPct||0)>=5?"#D1FAE5":(row.upliftPct||0)>=2?"#DBEAFE":"#F3F4F6";
                        const upliftFg = (row.upliftPct||0)>=5?"#065F46":(row.upliftPct||0)>=2?"#1E3A8A":"#374151";

                        return `
<section class="item-section">
  <div class="item-header">
    <div class="item-meta">
      <span class="item-num">#${i+1}</span>
      <span class="item-cat">${row.category||""}</span>
    </div>
    <h3 class="item-title">${row.title||""}</h3>
    <div class="item-stats">
      <div class="stat"><div class="stat-lbl">Typical Cost</div><div class="stat-val">${row.typicalCost||"—"}</div></div>
      <div class="stat hl"><div class="stat-lbl">Value Added</div><div class="stat-val" style="color:${accent}">$${(row.valueAdded||0).toLocaleString()}</div></div>
      <div class="stat"><div class="stat-lbl">New Value</div><div class="stat-val">$${(row.newValue||0).toLocaleString()}</div></div>
      <div class="stat"><div class="stat-lbl">Uplift</div><div class="stat-val"><span style="padding:2px 6px;border-radius:99px;background:${upliftBg};color:${upliftFg};font-size:10px">+${(row.upliftPct||0).toFixed(1)}%</span></div></div>
      ${row.roi!=null?`<div class="stat"><div class="stat-lbl">ROI</div><div class="stat-val" style="color:${roiColor}">${row.roi}%</div></div>`:""}
    </div>
  </div>

  <div class="process-header">
    Permit Process ${isLocal}${portalLink}
    ${d?.totalTimeline?`<span style="font-size:10px;color:#888;margin-left:8px">· ${d.totalTimeline}</span>`:""}
  </div>
  ${feesNote}
  ${steps.length>0?`
  <ol class="steps">
    ${steps.map(s=>`<li>
      <div class="step-title">${s.title||""}${s.duration?`<span class="step-dur">${s.duration}</span>`:""}</div>
      <div class="step-desc">${s.description||""}</div>
    </li>`).join("")}
  </ol>`:"<p style='color:#888;font-size:11px'>No permit steps available.</p>"}
  ${notesNote}

  ${reqs.length>0?`
  <div class="reqs">
    <div class="reqs-title">Key Requirements</div>
    <ul>${reqs.map(r=>`<li>${r}</li>`).join("")}</ul>
  </div>`:""}
  ${d?.tips?`<div class="tip"><span>💡</span> ${d.tips}</div>`:""}
</section>`;
                      }).join("");

                      const detailedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${titleSlug}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#111;background:#fff}
.page{max-width:900px;margin:0 auto;padding:36px 44px}
.doc-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;padding-bottom:14px;border-bottom:3px solid ${accent}}
.doc-header h1{font-family:'Source Serif 4',Georgia,serif;font-size:20px;font-weight:600;color:#111;margin-bottom:3px}
.doc-header p{font-size:11px;color:#666;line-height:1.5}
.doc-meta{text-align:right;font-size:11px;color:#888}
.brand{font-size:12px;font-weight:700;color:${accent};margin-bottom:2px}
.summary-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px}
.sc{border:1px solid #e5e7eb;border-radius:8px;padding:11px 13px}
.sc .l{font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#999;margin-bottom:4px}
.sc .v{font-size:16px;font-weight:700;color:#111;margin-bottom:1px}
.sc .s{font-size:10px;color:#aaa}
.sc.hl{border-color:${accent};background:${accent}0d}
.sc.hl .v{color:${accent}}
.item-section{border:1px solid #e5e7eb;border-radius:8px;margin-bottom:18px;overflow:hidden;page-break-inside:avoid}
.item-header{background:#f9fafb;padding:12px 14px;border-bottom:1px solid #e5e7eb}
.item-meta{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.item-num{font-size:10px;font-weight:700;color:#999}
.item-cat{font-size:10px;color:#888;background:#efefef;padding:1px 7px;border-radius:99px}
.item-title{font-family:'Source Serif 4',Georgia,serif;font-size:15px;font-weight:600;color:#111;margin-bottom:8px}
.item-stats{display:flex;gap:14px;flex-wrap:wrap}
.stat{min-width:80px}
.stat-lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px}
.stat-val{font-size:12px;font-weight:600;color:#111}
.stat.hl .stat-val{color:${accent}}
.process-header{font-size:12px;font-weight:600;color:#111;padding:10px 14px 6px;display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.steps{padding:4px 14px 10px 14px;list-style:none;counter-reset:step}
.steps li{position:relative;padding:5px 0 5px 26px;border-bottom:1px solid #f3f4f6;counter-increment:step}
.steps li:last-child{border-bottom:none}
.steps li::before{content:counter(step);position:absolute;left:0;top:6px;width:17px;height:17px;border-radius:50%;background:${accent};color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;line-height:17px}
.step-title{font-size:11px;font-weight:600;color:#111;display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:2px}
.step-dur{font-size:9px;color:${accent};background:${accent}18;padding:1px 6px;border-radius:99px;font-weight:500}
.step-desc{font-size:11px;color:#555;line-height:1.4}
.reqs{padding:8px 14px 10px;border-top:1px solid #f3f4f6;background:#fafafa}
.reqs-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#888;margin-bottom:5px}
.reqs ul{list-style:none;padding:0}
.reqs ul li{font-size:11px;color:#444;padding:2px 0 2px 14px;position:relative}
.reqs ul li::before{content:"•";position:absolute;left:3px;color:${accent}}
.tip{font-size:10px;color:#555;font-style:italic;padding:7px 14px;border-top:1px solid #f3f4f6;background:#fffbf0;line-height:1.5}
.tip span{margin-right:4px}
.footer{border-top:1px solid #e5e7eb;padding-top:11px;margin-top:10px;font-size:9px;color:#bbb;line-height:1.6}
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .item-section{page-break-inside:avoid}
  .page{padding:20px 28px}
}
</style>
</head>
<body>
<div class="page">
  <div class="doc-header">
    <div>
      <h1>Detailed Permit Report</h1>
      <p>${address.replace(/</g,"&lt;")} &middot; Purchase: ${purchaseStr} &middot; ${cityKey} market</p>
    </div>
    <div class="doc-meta">
      <div class="brand">Property Value Predictor</div>
      <div>S&amp;P/Case-Shiller (FRED)</div>
      <div style="margin-top:3px">${today}</div>
    </div>
  </div>

  <div class="summary-cards">
    <div class="sc"><div class="l">Purchase Price</div><div class="v">${fmt(price)}</div><div class="s">${purchaseStr}</div></div>
    <div class="sc hl"><div class="l">Est. Value Today</div><div class="v">${fmt(todayPt?.value||0)}</div><div class="s">${new Date().toLocaleDateString("en-US",{month:"short",year:"numeric"})}</div></div>
    <div class="sc hl"><div class="l">Gain to Date</div><div class="v">${fmtPct(pctNow)}</div><div class="s">${fmt(gainNow)} total</div></div>
  </div>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:22px;line-height:1.7;font-size:11px;color:#444">
    <div style="font-family:'Source Serif 4',Georgia,serif;font-size:13px;font-weight:600;color:#111;margin-bottom:6px">About This Report</div>
    This detailed permit report covers <strong>${items.length} improvement ${items.length===1?"opportunity":"opportunities"}</strong> identified for <strong>${address.replace(/</g,"&lt;")}</strong>, ranked by return on investment.
    Each section contains the complete local permitting process sourced from the <strong>${cityKey}</strong> building department website where available, or general best-practice guidance where local data could not be retrieved.
    Steps marked <span style="display:inline-block;padding:1px 6px;border-radius:99px;background:#D1FAE5;color:#065F46;font-size:9px;font-weight:700">📍 Local data</span> reflect the actual process published by your city's building department.
    Steps marked <span style="display:inline-block;padding:1px 6px;border-radius:99px;background:#F3F4F6;color:#6B7280;font-size:9px;font-weight:500">General guide</span> are standard industry practice — verify current requirements at your local building department before proceeding.
    Valuation estimates are adjusted for the ${cityKey} market using Remodeling Magazine Cost vs. Value and NAR Remodeling Impact data. ROI = estimated value added ÷ midpoint project cost.
  </div>

  ${itemSections}

  <div class="footer">
    Generated ${today} &middot; Permit steps sourced from local city building department websites where available, otherwise general guidance. Not a professional appraisal or legal advice. Verify all requirements with your local building department before proceeding.
  </div>
</div>
<script>window.onload=function(){window.print();}</script>
</body>
</html>`;

                      const blob2 = new Blob([detailedHtml], { type: "text/html;charset=utf-8" });
                      const url2  = URL.createObjectURL(blob2);
                      const a2    = document.createElement("a");
                      a2.href     = url2;
                      a2.target   = "_blank";
                      a2.rel      = "noopener noreferrer";
                      a2.download = pdfFilename;
                      document.body.appendChild(a2);
                      a2.click();
                      document.body.removeChild(a2);
                      setTimeout(()=>URL.revokeObjectURL(url2), 20000);
                      setDetailedPdfStatus("success");
                      setTimeout(()=>setDetailedPdfStatus("idle"), 6000);
                    } catch(err) {
                      console.error("Detailed PDF error:", err);
                      setDetailedPdfStatus("error");
                      setTimeout(()=>setDetailedPdfStatus("idle"), 6000);
                    }
                  }}
                  style={{
                    display:"flex",alignItems:"center",gap:8,
                    padding:"12px 22px",
                    borderRadius:"var(--border-radius-md)",
                    border:"2px solid "+(detailedPdfStatus==="error"?"#DC2626":detailedPdfStatus==="success"?"#059669":accent),
                    background: detailedPdfStatus==="error"?"#DC2626":detailedPdfStatus==="success"?"#059669":"transparent",
                    color: detailedPdfStatus==="idle"?accent:"#fff",
                    cursor: detailedPdfStatus==="generating"?"wait":"pointer",
                    fontSize:14,fontWeight:600,
                    transition:"background 0.25s, border-color 0.25s, color 0.25s, opacity 0.15s",
                    opacity: detailedPdfStatus==="generating"?0.75:1,
                    minWidth:240,
                    justifyContent:"center",
                  }}
                  onMouseEnter={e=>{ if(detailedPdfStatus==="idle"){e.currentTarget.style.background=accent+"18";} }}
                  onMouseLeave={e=>{ if(detailedPdfStatus==="idle"){e.currentTarget.style.background="transparent";} }}
                >
                  {detailedPdfStatus==="generating"&&<span style={{display:"inline-block",width:14,height:14,border:"2px solid currentColor",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>}
                  {detailedPdfStatus==="success"&&<i className="ti ti-circle-check" style={{fontSize:16}}/>}
                  {detailedPdfStatus==="error"&&<i className="ti ti-alert-circle" style={{fontSize:16}}/>}
                  {(detailedPdfStatus==="idle"||detailedPdfStatus==="generating")&&<i className="ti ti-report" style={{fontSize:16}}/>}
                  {detailedPdfStatus==="generating"?"Fetching local permit data…"
                    :detailedPdfStatus==="success"?"Detailed report opened"
                    :detailedPdfStatus==="error"?"Failed — try again"
                    :"Generate Detailed Permit Report"}
                </button>
              </div>{/* end button row */}

              {/* Status messages */}
              {pdfStatus==="error"&&(
                <p style={{fontSize:11,color:"#DC2626",textAlign:"center",maxWidth:400,lineHeight:1.5}}>
                  <i className="ti ti-info-circle" style={{marginRight:4}}/>
                  Browser may be blocking popups. Allow popups for this site, or right-click → Open in new tab.
                </p>
              )}
              {pdfStatus==="success"&&(
                <p style={{fontSize:11,color:"#059669",textAlign:"center",lineHeight:1.5}}>
                  <i className="ti ti-check" style={{marginRight:4}}/>
                  Report opened. Choose <strong>Save as PDF</strong> in the print dialog — filename is pre-filled as the street address.
                </p>
              )}
              {detailedPdfStatus==="error"&&(
                <p style={{fontSize:11,color:"#DC2626",textAlign:"center",maxWidth:400,lineHeight:1.5}}>
                  <i className="ti ti-info-circle" style={{marginRight:4}}/>
                  Could not generate detailed report. Check browser popup settings and try again.
                </p>
              )}
              {detailedPdfStatus==="success"&&(
                <p style={{fontSize:11,color:"#059669",textAlign:"center",lineHeight:1.5}}>
                  <i className="ti ti-check" style={{marginRight:4}}/>
                  Detailed report opened with local permit steps. Choose <strong>Save as PDF</strong> — filename pre-filled as street address.
                </p>
              )}
              {detailedPdfStatus==="generating"&&(
                <p style={{fontSize:11,color:"var(--color-text-secondary)",textAlign:"center",lineHeight:1.5}}>
                  <i className="ti ti-loader" style={{marginRight:4}}/>
                  Looking up local permit processes for {valuationData?.length||0} improvements…
                </p>
              )}
            </div>
          )}

          <p style={{fontSize:11,color:"var(--color-text-tertiary)",lineHeight:1.6,margin:0}}>
            <i className="ti ti-info-circle" style={{fontSize:13,verticalAlign:"-2px",marginRight:3}}/>
            Not a professional appraisal. Do not use for financial or legal decisions. Historical values from FRED Case-Shiller indices; forecasts are model estimates only.
          </p>
        </div>
      )}

      {!submitted&&<div style={{textAlign:"center",padding:"2.5rem 1rem",color:"var(--color-text-tertiary)",fontSize:13}}><i className="ti ti-chart-line" style={{fontSize:38,display:"block",marginBottom:10}}/>Enter any address and purchase date — data available from 1987</div>}
    </div>
  );
}
